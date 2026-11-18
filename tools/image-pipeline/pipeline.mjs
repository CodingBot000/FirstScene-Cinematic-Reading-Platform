import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { Ajv2020 } from "ajv/dist/2020.js";
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export async function inspectVariant(file, variant, role) {
  const bytes = fs.readFileSync(file);
  const meta = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
  const format =
    meta.format === "heif" && meta.compression === "av1" ? "avif" : meta.format;
  const limit =
    (role === "background"
      ? variant.width <= 960
        ? 180
        : 380
      : role === "cover"
        ? 180
        : 140) * 1024;
  if (format !== variant.format || meta.pages > 1)
    throw new Error("VARIANT_MIME_DRIFT");
  if (
    digest(bytes) !== variant.sha256 ||
    bytes.length !== variant.bytes ||
    meta.width !== variant.width ||
    meta.height !== variant.height
  )
    throw new Error("VARIANT_DRIFT");
  if (bytes.length > limit) throw new Error("VARIANT_BYTE_BUDGET");
}
export function pipeline(project = process.cwd()) {
  const root = fs.realpathSync(project);
  const at = (relative) => path.join(root, relative);
  const plan = JSON.parse(
    fs.readFileSync(at("content/asset-plan.json"), "utf8"),
  );
  const stateFile = at("execution/assets-state.json");
  const ledgerFile = at("execution/assets-ledger.jsonl");
  const state = fs.existsSync(stateFile)
    ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
    : { schemaVersion: 1, assets: {} };
  const ledger = () =>
    fs.existsSync(ledgerFile)
      ? fs
          .readFileSync(ledgerFile, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
  const event = (value) => {
    fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
    fs.appendFileSync(
      ledgerFile,
      JSON.stringify({ ...value, observedAt: new Date().toISOString() }) + "\n",
    );
  };
  const save = () => {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    const tmp = stateFile + "." + randomUUID() + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", {
      flag: "wx",
    });
    fs.renameSync(tmp, stateFile);
  };
  const asset = (id) => {
    const a = plan.assets.find((a) => a.id === id);
    if (!a || !/^[a-z][a-z0-9-]{1,63}$/.test(id))
      throw new Error("UNKNOWN_ASSET");
    return a;
  };
  function validatePlan() {
    const schema = JSON.parse(
      fs.readFileSync(at("contracts/asset-plan.schema.json"), "utf8"),
    );
    const check = new Ajv2020({ strict: true }).compile(schema);
    if (!check(plan)) throw new Error(JSON.stringify(check.errors));
    const seen = new Set(),
      visiting = new Set();
    const walk = (id) => {
      if (visiting.has(id)) throw new Error("ASSET_CYCLE");
      if (seen.has(id)) return;
      visiting.add(id);
      const a = asset(id);
      for (const ref of [
        ...a.referenceIds,
        ...(a.derivedFrom ? [a.derivedFrom] : []),
      ])
        walk(ref);
      visiting.delete(id);
      seen.add(id);
    };
    if (new Set(plan.assets.map((a) => a.id)).size !== plan.assets.length)
      throw new Error("DUPLICATE_ASSET_ID");
    for (const a of plan.assets) walk(a.id);
    return {
      attemptsUsed: ledger().filter((e) => e.status === "STARTED").length,
      maxAttempts: plan.maxGenerationAttempts,
      apiBudgetUsd: plan.apiBudgetUsd,
      queue: plan.assets
        .filter((a) => state.assets[a.id]?.status !== "approved")
        .map((a) => ({
          id: a.id,
          method: a.method,
          dependencies: [
            ...a.referenceIds,
            ...(a.derivedFrom ? [a.derivedFrom] : []),
          ],
          ready: [
            ...a.referenceIds,
            ...(a.derivedFrom ? [a.derivedFrom] : []),
          ].every((id) => state.assets[id]?.status === "approved"),
        })),
    };
  }
  function begin(id, revisionNote = "") {
    const a = asset(id);
    if (a.method !== "generate") throw new Error("DERIVED_ASSET_NO_GENERATION");
    if (state.assets[id])
      throw new Error("ALREADY_IMPORTED_REVIEW_BEFORE_REGENERATION");
    const history = ledger(),
      attempts = history.filter((e) => e.status === "STARTED");
    if (attempts.length >= plan.maxGenerationAttempts)
      throw new Error("ATTEMPT_LIMIT");
    const own = attempts.filter((e) => e.assetId === id);
    if (own.length >= 3) throw new Error("ASSET_RETRY_LIMIT");
    const last = history.filter((e) => e.assetId === id).at(-1);
    if (last && ["STARTED", "UNKNOWN_OUTCOME"].includes(last.status))
      throw new Error("UNKNOWN_OUTCOME_RECONCILE_BEFORE_RETRY");
    const refs = a.referenceIds.map((id) => {
      const ref = state.assets[id];
      if (ref?.status !== "approved")
        throw new Error("REFERENCE_NOT_APPROVED " + id);
      return { id, hash: ref.sourceSha256, path: at(ref.path) };
    });
    const attemptId = randomUUID();
    const prompt =
      (refs.length
        ? "Input images are approved style and palette references only; create the exact newly requested scene, do not copy the reference composition.\n"
        : "") +
      a.prompt +
      "\nTarget aspect ratio: " +
      a.aspectRatio +
      "." +
      (revisionNote ? "\nTargeted correction: " + revisionNote : "");
    event({
      assetId: id,
      attemptId,
      promptHash: digest(prompt),
      referenceHashes: refs.map((r) => r.hash),
      requestedModel: plan.requestedModel,
      actualModel: "unknown",
      provider: "codex-native",
      startedAt: new Date().toISOString(),
      status: "STARTED",
      sourceHash: null,
      usage: null,
      estimatedCost: null,
    });
    return {
      attemptId,
      prompt,
      referencePaths: refs.map((r) => r.path),
    };
  }
  async function importFile(id, file, provider = "codex-native") {
    if (provider !== "codex-native") throw new Error("PROVIDER_NOT_AUTHORIZED");
    const a = asset(id);
    if (a.method !== "generate") throw new Error("DERIVED_ASSET");
    if (state.assets[id]) throw new Error("DUPLICATE_IMPORT");
    const attempt = ledger()
      .filter((e) => e.assetId === id && e.status === "STARTED")
      .at(-1);
    if (!attempt) throw new Error("NO_REGISTERED_ATTEMPT");
    for (const id of a.referenceIds)
      if (state.assets[id]?.status !== "approved")
        throw new Error("REFERENCE_NOT_APPROVED");
    const source = path.resolve(file);
    if (fs.realpathSync(source) !== source || !fs.lstatSync(source).isFile())
      throw new Error("SOURCE_SYMLINK_OR_NONFILE");
    const stat = fs.statSync(source);
    if (stat.size > 32 * 1024 * 1024 || stat.size < 12)
      throw new Error("SOURCE_BYTE_LIMIT");
    const bytes = fs.readFileSync(source);
    if (bytes.length > 32 * 1024 * 1024) throw new Error("SOURCE_BYTE_LIMIT");
    const image = sharp(bytes, {
      limitInputPixels: 40_000_000,
      failOn: "warning",
    });
    const meta = await image.metadata();
    if (
      !["png", "jpeg", "webp", "avif", "heif"].includes(meta.format) ||
      (meta.format === "heif" && meta.compression !== "av1") ||
      meta.pages > 1 ||
      !meta.width ||
      !meta.height ||
      meta.width > 8192 ||
      meta.height > 8192 ||
      meta.width * meta.height > 40_000_000
    )
      throw new Error("UNSAFE_IMAGE_FORMAT_OR_PIXELS");
    await image.clone().raw().toBuffer();
    const hash = digest(bytes);
    if (Object.values(state.assets).some((a) => a.sourceSha256 === hash))
      throw new Error("DUPLICATE_SOURCE");
    const dest = at(
      `artifacts/raw/${id}.${hash.slice(0, 12)}.${meta.format === "jpeg" ? "jpg" : meta.format === "heif" ? "avif" : meta.format}`,
    );
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.realpathSync(path.dirname(dest)) !== path.dirname(dest))
      throw new Error("DESTINATION_SYMLINK");
    const tmp = dest + "." + randomUUID() + ".tmp";
    fs.writeFileSync(tmp, bytes, { flag: "wx" });
    fs.renameSync(tmp, dest);
    state.assets[id] = {
      id,
      path: path.relative(root, dest),
      sourceSha256: hash,
      width: meta.width,
      height: meta.height,
      bytes: stat.size,
      format: meta.format,
      status: "imported",
      generationId: attempt.attemptId,
      provider,
      actualModel: "unknown",
    };
    save();
    event({
      assetId: id,
      attemptId: attempt.attemptId,
      status: "IMPORTED",
      sourceHash: hash,
      actualModel: "unknown",
      usage: null,
      estimatedCost: null,
    });
    return state.assets[id];
  }
  function review(id, score, notes) {
    asset(id);
    const a = state.assets[id];
    if (
      !a ||
      !Number.isInteger(score) ||
      score < 8 ||
      score > 10 ||
      typeof notes !== "string" ||
      notes.length < 20
    )
      throw new Error("VISUAL_REVIEW_REQUIRED");
    a.status = "approved";
    a.review = {
      status: "approved",
      reviewerType: "agent_visual",
      score,
      notes,
    };
    save();
    const manifestFile = at("content/generated/assets.json");
    if (fs.existsSync(manifestFile)) {
      const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
      const published = manifest.assets.find((item) => item.id === id);
      if (published) {
        published.review = a.review;
        fs.writeFileSync(
          manifestFile,
          JSON.stringify(manifest, null, 2) + "\n",
        );
      }
    }
    event({
      assetId: id,
      status: "APPROVED",
      sourceHash: a.sourceSha256,
      score,
      reviewerType: "agent_visual",
    });
    return a;
  }
  function denyPaid() {
    throw new Error(
      "PAID_API_DENIED: default budget is0 USD; no authorized API adapter/approval file exists. Native generation is orchestrated only by the agent tool.",
    );
  }
  async function optimize({ partial = false } = {}) {
    for (const a of plan.assets.filter((a) => a.method === "generate"))
      if (!partial && state.assets[a.id]?.status !== "approved")
        throw new Error("UNAPPROVED_SOURCE " + a.id);
    fs.mkdirSync(at("apps/web/public/assets"), { recursive: true });
    const manifest = { schemaVersion: 1, assets: [] };
    for (const a of plan.assets.filter((a) => a.role !== "reference")) {
      const ref = state.assets[a.derivedFrom ?? a.id];
      if (partial && ref?.status !== "approved") continue;
      const source = fs.readFileSync(at(ref.path));
      if (digest(source) !== ref.sourceSha256)
        throw new Error("SOURCE_HASH_DRIFT");
      const normalized = await sharp(source, { limitInputPixels: 40_000_000 })
        .rotate()
        .toColourspace("srgb")
        .png()
        .toBuffer();
      const meta = await sharp(normalized).metadata();
      const [rw, rh] = a.aspectRatio.split(":").map(Number);
      const ratio = rw / rh;
      let cw = meta.width,
        ch = Math.round(cw / ratio);
      if (ch > meta.height) {
        ch = meta.height;
        cw = Math.round(ch * ratio);
      }
      const left = Math.max(
        0,
        Math.min(
          meta.width - cw,
          Math.round(meta.width * a.focalPoint.x - cw / 2),
        ),
      );
      const top = Math.max(
        0,
        Math.min(
          meta.height - ch,
          Math.round(meta.height * a.focalPoint.y - ch / 2),
        ),
      );
      const widths = (
        a.role === "background"
          ? [480, 960, 1440, 1920]
          : a.role === "cover"
            ? [320, 640, 960]
            : [320, 640]
      ).filter((w) => w <= cw);
      if (!widths.length) throw new Error("SOURCE_TOO_SMALL");
      const variants = [];
      for (const width of widths)
        for (const format of ["avif", "webp"]) {
          const height = Math.round(width / ratio);
          const limit =
            (a.role === "background"
              ? width <= 960
                ? 180
                : 380
              : a.role === "cover"
                ? 180
                : 140) * 1024;
          let output,
            quality = format === "avif" ? 48 : 78;
          const floor = format === "avif" ? 35 : 62;
          while (true) {
            output = await sharp(normalized)
              .extract({ left, top, width: cw, height: ch })
              .resize(width, height)
              .toFormat(format, { quality })
              .toBuffer();
            if (output.length <= limit) break;
            if (quality <= floor) throw new Error("ASSET_BYTE_BUDGET " + a.id);
            quality = Math.max(floor, quality - 4);
          }
          const sha = digest(output),
            relative = `/assets/${a.id}.${sha.slice(0, 8)}.${width}.${format}`;
          fs.writeFileSync(at("apps/web/public" + relative), output);
          variants.push({
            path: relative,
            format,
            width,
            height,
            bytes: output.length,
            sha256: sha,
          });
        }
      if (a.derivedFrom && !state.assets[a.id]) {
        state.assets[a.id] = {
          id: a.id,
          method: "derive",
          derivedFrom: a.derivedFrom,
          path: ref.path,
          sourceSha256: ref.sourceSha256,
          generationId: ref.generationId,
          status: "derived_pending_review",
          derivation: { left, top, width: cw, height: ch },
          provider: "sharp",
          actualModel: "not-applicable",
        };
      }
      const review = a.derivedFrom
        ? (state.assets[a.id].review ?? {
            status: "pending",
            reviewerType: "agent_visual",
            score: 0,
            notes: "Actual optimized portrait crop awaits visual review.",
          })
        : ref.review;
      manifest.assets.push({
        id: a.id,
        role: a.role,
        sourceSha256: ref.sourceSha256,
        generationId: ref.generationId,
        alt: a.alt,
        decorative: a.decorative,
        review,
        variants,
        focalPoint: a.focalPoint,
      });
    }
    fs.mkdirSync(at("content/generated"), { recursive: true });
    save();
    fs.writeFileSync(
      at("content/generated/assets.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    return manifest;
  }
  async function verify() {
    const manifest = JSON.parse(
      fs.readFileSync(at("content/generated/assets.json"), "utf8"),
    );
    const schema = JSON.parse(
      fs.readFileSync(at("contracts/asset-manifest.schema.json"), "utf8"),
    );
    const check = new Ajv2020({ strict: true }).compile(schema);
    if (!check(manifest)) throw new Error(JSON.stringify(check.errors));
    if (
      manifest.assets.length !== 16 ||
      new Set(manifest.assets.map((a) => a.id)).size !== 16
    )
      throw new Error("PUBLIC_ASSET_COUNT");
    for (const planned of plan.assets.filter((a) => a.role !== "reference"))
      if (!manifest.assets.some((a) => a.id === planned.id))
        throw new Error("MISSING_PUBLIC_ASSET " + planned.id);
    for (const a of manifest.assets) {
      const planned = asset(a.id);
      const sourceId = planned.derivedFrom ?? a.id;
      const source = state.assets[sourceId];
      if (
        a.role !== planned.role ||
        a.decorative !== planned.decorative ||
        a.alt !== planned.alt ||
        JSON.stringify(a.focalPoint) !== JSON.stringify(planned.focalPoint)
      )
        throw new Error("ASSET_CONTRACT_DRIFT");
      if (
        source?.status !== "approved" ||
        source.sourceSha256 !== a.sourceSha256 ||
        source.generationId !== a.generationId
      )
        throw new Error("SOURCE_PROVENANCE_DRIFT");
      if (planned.derivedFrom && state.assets[a.id]?.status !== "approved")
        throw new Error("PORTRAIT_REVIEW_REQUIRED");
      if (
        !ledger().some(
          (entry) =>
            entry.assetId === sourceId &&
            entry.status === "IMPORTED" &&
            entry.sourceHash === a.sourceSha256 &&
            entry.attemptId === a.generationId,
        )
      )
        throw new Error("GENERATION_PROVENANCE_MISSING");
      for (const v of a.variants) {
        if (
          !/^\/assets\/[a-z0-9][a-z0-9._-]+$/.test(v.path) ||
          v.path.includes("..")
        )
          throw new Error("ASSET_PATH");
        const file = at("apps/web/public" + v.path);
        if (fs.realpathSync(file) !== file) throw new Error("ASSET_SYMLINK");
        if (
          v.path !==
          `/assets/${a.id}.${v.sha256.slice(0, 8)}.${v.width}.${v.format}`
        )
          throw new Error("VARIANT_FILENAME_DRIFT");
        await inspectVariant(file, v, a.role);
      }
    }
    return {
      publicAssets: manifest.assets.length,
      variants: manifest.assets.flatMap((a) => a.variants).length,
      sha256: digest(JSON.stringify(manifest)),
    };
  }
  return {
    validatePlan,
    begin,
    importFile,
    review,
    optimize,
    verify,
    denyPaid,
  };
}
