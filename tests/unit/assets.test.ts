import { it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import {
  pipeline,
  inspectVariant,
  digest,
} from "../../tools/image-pipeline/pipeline.mjs";
const owned: string[] = [];
function fixture() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "firstscene-assets-test-")),
  );
  owned.push(root);
  for (const dir of ["content", "contracts", "execution"])
    fs.mkdirSync(path.join(root, dir));
  for (const file of [
    "content/asset-plan.json",
    "contracts/asset-plan.schema.json",
    "contracts/asset-manifest.schema.json",
  ])
    fs.copyFileSync(file, path.join(root, file));
  return { root, tool: pipeline(root) };
}
afterEach(() => {
  for (const root of owned.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
it("P02 queue is read-only and requires reference approvals", () => {
  const { root, tool } = fixture();
  expect(tool.validatePlan().attemptsUsed).toBe(0);
  expect(fs.existsSync(path.join(root, "execution/assets-ledger.jsonl"))).toBe(
    false,
  );
  expect(() => tool.begin("mail-cover")).toThrow(/REFERENCE_NOT_APPROVED/);
});
it("P02 budget0 denies all paid execution and uses no API credentials", () => {
  const { tool } = fixture();
  expect(() => tool.denyPaid()).toThrow(/0 USD/);
});
it("P02 unresolved/unknown outcomes block duplicate native calls", () => {
  const { root, tool } = fixture();
  tool.begin("mail-character-ref");
  expect(() => tool.begin("mail-character-ref")).toThrow(/UNKNOWN_OUTCOME/);
  fs.appendFileSync(
    path.join(root, "execution/assets-ledger.jsonl"),
    JSON.stringify({
      assetId: "mail-character-ref",
      status: "UNKNOWN_OUTCOME",
    }) + "\n",
  );
  expect(() => tool.begin("mail-character-ref")).toThrow(/UNKNOWN_OUTCOME/);
});
it("P02 total22attempt limit includes design concepts", () => {
  const { root, tool } = fixture();
  fs.writeFileSync(
    path.join(root, "execution/assets-ledger.jsonl"),
    Array.from({ length: 22 }, (_, i) =>
      JSON.stringify({ assetId: "concept-" + i, status: "STARTED" }),
    ).join("\n") + "\n",
  );
  expect(() => tool.begin("mail-character-ref")).toThrow(/ATTEMPT_LIMIT/);
});
it("P02 import sniffs bytes, preserves raw hash and requires a distinct visual review", async () => {
  const { root, tool } = fixture();
  tool.begin("mail-character-ref");
  const file = path.join(root, "source.wrongextension");
  await sharp({
    create: { width: 320, height: 480, channels: 3, background: "#ddd" },
  })
    .png()
    .toFile(file);
  const result = await tool.importFile("mail-character-ref", file);
  expect(result.format).toBe("png");
  expect(result.status).toBe("imported");
  expect(fs.existsSync(path.join(root, result.path))).toBe(true);
  expect(() => tool.begin("mail-cover")).toThrow(/REFERENCE_NOT_APPROVED/);
  tool.review(
    "mail-character-ref",
    9,
    "Synthetic test fixture review only, never a production asset.",
  );
  expect(tool.begin("mail-cover").referencePaths).toHaveLength(1);
  await expect(tool.importFile("mail-character-ref", file)).rejects.toThrow(
    /DUPLICATE_IMPORT/,
  );
});
it("P02 import rejects symlinks, executable/vector bytes, excessive dimensions and oversized files", async () => {
  const { root, tool } = fixture();
  tool.begin("mail-character-ref");
  const file = path.join(root, "image.png");
  await sharp({
    create: { width: 8193, height: 1, channels: 3, background: "#ddd" },
  })
    .png()
    .toFile(file);
  await expect(tool.importFile("mail-character-ref", file)).rejects.toThrow(
    /PIXELS/,
  );
  const link = path.join(root, "link.png");
  fs.symlinkSync(file, link);
  await expect(tool.importFile("mail-character-ref", link)).rejects.toThrow(
    /SYMLINK/,
  );
  fs.writeFileSync(
    file,
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
  );
  await expect(tool.importFile("mail-character-ref", file)).rejects.toThrow();
  fs.writeFileSync(file, "#!/bin/sh\necho dangerous");
  await expect(tool.importFile("mail-character-ref", file)).rejects.toThrow();
  const fd = fs.openSync(file, "w");
  fs.ftruncateSync(fd, 32 * 1024 * 1024 + 1);
  fs.closeSync(fd);
  await expect(tool.importFile("mail-character-ref", file)).rejects.toThrow(
    /BYTE_LIMIT/,
  );
  expect(fs.existsSync(path.join(root, "execution/assets-state.json"))).toBe(
    false,
  );
});
it("P02 source regeneration and optimization cannot bypass approval", async () => {
  const { tool } = fixture();
  await expect(tool.optimize()).rejects.toThrow(/UNAPPROVED_SOURCE/);
  expect(() => tool.review("mail-character-ref", 10, "not imported")).toThrow(
    /REVIEW_REQUIRED/,
  );
  expect(() => tool.begin("../escape")).toThrow(/UNKNOWN_ASSET/);
});
it("P02 partial preview never promotes an incomplete manifest through release verification", async () => {
  const { tool } = fixture();
  const manifest = await tool.optimize({ partial: true });
  expect(manifest.assets).toHaveLength(0);
  await expect(tool.verify()).rejects.toThrow(/PUBLIC_ASSET_COUNT/);
  await expect(tool.optimize()).rejects.toThrow(/UNAPPROVED_SOURCE/);
});

it("P02 releasevariant inspection checks actualcodec/bytes/hash/dimensions, not only extension", async () => {
  const { root } = fixture();
  const file = path.join(root, "encoded.webp");
  const bytes = await sharp({
    create: { width: 64, height: 40, channels: 3, background: "#345" },
  })
    .webp()
    .toBuffer();
  fs.writeFileSync(file, bytes);
  const variant = {
    format: "webp",
    width: 64,
    height: 40,
    bytes: bytes.length,
    sha256: digest(bytes),
  };
  await expect(
    inspectVariant(file, variant, "background"),
  ).resolves.toBeUndefined();
  await expect(
    inspectVariant(file, { ...variant, format: "avif" }, "background"),
  ).rejects.toThrow(/MIME_DRIFT/);
  await expect(
    inspectVariant(file, { ...variant, width: 65 }, "background"),
  ).rejects.toThrow(/VARIANT_DRIFT/);
  await expect(
    inspectVariant(file, { ...variant, sha256: "0".repeat(64) }, "background"),
  ).rejects.toThrow(/VARIANT_DRIFT/);
});
it("P02 reviewer cannot mark an unknown/prototype asset approved", () => {
  const { tool } = fixture();
  expect(() =>
    tool.review("__proto__", 9, "Not a legitimate review of a planned asset."),
  ).toThrow(/UNKNOWN_ASSET/);
});
