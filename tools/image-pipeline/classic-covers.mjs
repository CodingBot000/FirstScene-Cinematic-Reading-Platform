import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import sharp from "sharp";
import { digest, inspectVariant } from "./pipeline.mjs";

const sourceMapPath = "apps/web/lib/classic-covers.json";
const assetFolder = "/assets/classics/";
const manifestPath = "content/generated/classic-cover-assets.json";
const formats = ["avif", "webp"];
const widths = [96, 144, 240, 320, 480, 640];
const sourceSize = { width: 640, height: 853 };
const provenance = {
  kind: "generated-illustration",
  sourceCommit: "e9b8d38a198a1578bbcaf7a1a7b09d5d4ee8450b",
  documentation: "docs/classic-cover-art.md",
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function publicFile(assetPath) {
  return path.resolve("apps/web/public" + assetPath);
}

function assertRegularAsset(file) {
  if (!fs.lstatSync(file).isFile() || fs.realpathSync(file) !== file)
    throw new Error("CLASSIC_COVER_FILE_INVALID");
}

async function inspectSources() {
  const ids = readJson("content/classics/catalog.json").map(({ id }) => id);
  const sources = readJson(sourceMapPath);
  if (
    Object.keys(sources).length !== ids.length ||
    new Set(ids).size !== ids.length ||
    !fs.existsSync(provenance.documentation)
  )
    throw new Error("CLASSIC_COVER_INVENTORY_DRIFT");
  return Promise.all(
    ids.map(async (id) => {
      const sourcePath = sources[id];
      const prefix = assetFolder + id + ".";
      if (
        !/^classic-[a-z0-9-]+$/.test(id) ||
        typeof sourcePath !== "string" ||
        !sourcePath.startsWith(prefix) ||
        !/^[a-f0-9]{12}\.webp$/.test(sourcePath.slice(prefix.length))
      )
        throw new Error("CLASSIC_COVER_SOURCE_PATH");
      const file = publicFile(sourcePath);
      assertRegularAsset(file);
      const image = fs.readFileSync(file);
      const sha256 = digest(image);
      if (sourcePath !== `${assetFolder}${id}.${sha256.slice(0, 12)}.webp`)
        throw new Error("CLASSIC_COVER_SOURCE_HASH");
      const source = {
        path: sourcePath,
        format: "webp",
        ...sourceSize,
        bytes: image.length,
        sha256,
      };
      await inspectVariant(file, source, "cover");
      return { id, source, image };
    }),
  );
}

function variantPath(id, sha256, width, format) {
  return `${assetFolder}${id}.${sha256.slice(0, 12)}.${width}.${format}`;
}

async function generateVariant(id, image, format, width, height) {
  const output = await sharp(image)
    .resize({ width, height, withoutEnlargement: true })
    .toFormat(format, { quality: format === "avif" ? 48 : 76 })
    .toBuffer();
  const sha256 = digest(output);
  const assetPath = variantPath(id, sha256, width, format);
  const file = publicFile(assetPath);
  if (fs.existsSync(file)) {
    assertRegularAsset(file);
    if (digest(fs.readFileSync(file)) !== sha256)
      throw new Error("CLASSIC_COVER_VARIANT_HASH_COLLISION");
  } else {
    fs.writeFileSync(file, output, { flag: "wx" });
  }
  return {
    path: assetPath,
    format,
    width,
    height,
    bytes: output.length,
    sha256,
  };
}

async function verifyVariant(id, stored, format, width, height) {
  if (
    typeof stored?.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(stored.sha256) ||
    !Number.isSafeInteger(stored.bytes) ||
    stored.bytes <= 0
  )
    throw new Error("CLASSIC_COVER_VARIANT_METADATA");
  const variant = {
    path: variantPath(id, stored.sha256, width, format),
    format,
    width,
    height,
    bytes: stored.bytes,
    sha256: stored.sha256,
  };
  if (!isDeepStrictEqual(variant, stored))
    throw new Error("CLASSIC_COVER_VARIANT_DRIFT");
  const file = publicFile(variant.path);
  assertRegularAsset(file);
  await inspectVariant(file, variant, "cover");
  return variant;
}

async function resolveManifest({ generate }) {
  const sources = await inspectSources();
  const current = generate ? null : readJson(manifestPath);
  if (
    !generate &&
    (!Array.isArray(current?.assets) ||
      current.assets.length !== sources.length)
  )
    throw new Error("CLASSIC_COVER_MANIFEST_INVENTORY_DRIFT");
  const assets = [];
  for (const [index, { id, source, image }] of sources.entries()) {
    const variants = [];
    for (const width of widths) {
      for (const format of formats) {
        if (width === source.width && format === source.format) {
          variants.push(source);
          continue;
        }
        const height = Math.round((width * 4) / 3);
        variants.push(
          generate
            ? await generateVariant(id, image, format, width, height)
            : await verifyVariant(
                id,
                current.assets[index]?.variants?.[variants.length],
                format,
                width,
                height,
              ),
        );
      }
    }
    assets.push({ id, source, focalPoint: { x: 0.5, y: 0.5 }, variants });
  }
  const manifest = { schemaVersion: 1, provenance, assets };
  if (generate) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  } else if (!isDeepStrictEqual(manifest, current)) {
    throw new Error("CLASSIC_COVER_MANIFEST_DRIFT");
  }
  return {
    covers: assets.length,
    variants: assets.reduce((sum, asset) => sum + asset.variants.length, 0),
    sha256: digest(JSON.stringify(manifest)),
  };
}

export function verifyClassicCovers() {
  return resolveManifest({ generate: false });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--generate")
    await resolveManifest({ generate: true });
  else if (process.argv.length > 2)
    throw new Error("CLASSIC_COVER_ARGUMENT_INVALID");
  console.log(JSON.stringify(await verifyClassicCovers()));
}
