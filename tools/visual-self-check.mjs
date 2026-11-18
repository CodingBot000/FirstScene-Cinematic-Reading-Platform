import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  verifyCurrentCapture,
  verifyReview,
  fileHash,
} from "./visual/verify.mjs";
const result = JSON.parse(
  fs.readFileSync("evidence/visual/current/result.json", "utf8"),
);
const manual = JSON.parse(
  fs.readFileSync("evidence/visual/review.json", "utf8"),
);
const baseline = verifyCurrentCapture(result);
const checks = [];
function reject(name, action, expected) {
  let actual = "NO_REJECTION";
  try {
    action();
  } catch (error) {
    actual = error.code ?? error.message;
  }
  checks.push({ name, expected, actual, passed: actual === expected });
  if (actual !== expected) throw new Error("VISUAL_NEGATIVE_GUARD_FAILED");
}
reject(
  "missing frame",
  () => verifyReview(result.captures.slice(1), manual, manual.indexPath),
  "VISUAL_COVERAGE_INCOMPLETE",
);
const changed = globalThis.structuredClone(result.captures);
changed[0].sha256 = "0".repeat(64);
reject(
  "changed captured hash",
  () => verifyReview(changed, manual, manual.indexPath),
  "VISUAL_PIXEL_REVIEW_REQUIRED",
);
reject(
  "changed review hash",
  () =>
    verifyReview(
      result.captures,
      { ...manual, indexSha256: "0".repeat(64) },
      manual.indexPath,
    ),
  "VISUAL_REVIEW_STALE_OR_INCOMPLETE",
);
reject(
  "stale source",
  () =>
    verifyCurrentCapture({
      ...result,
      sourceFingerprint: { sha256: "0".repeat(64) },
    }),
  "VISUAL_RECOLLECTION_REQUIRED",
);
reject(
  "unverified collection",
  () => verifyCurrentCapture({ ...result, collectionVerified: false }),
  "VISUAL_RECOLLECTION_REQUIRED",
);
reject(
  "different production build",
  () =>
    verifyCurrentCapture({ ...result, productionBuildId: "different-build" }),
  "VISUAL_RECOLLECTION_REQUIRED",
);
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), "firstscene-visual-evidence-check-"),
);
try {
  const bad = JSON.parse(fs.readFileSync(manual.indexPath, "utf8"));
  for (const item of bad.captures) {
    item.scores = {
      hierarchy: 0,
      typography: 2,
      colorContrast: 2,
      alignmentSpacing: 2,
      interaction: 2,
      mobile: 2,
    };
    item.total = 10;
  }
  const index = path.join(temporary, "index.json");
  fs.writeFileSync(index, JSON.stringify(bad));
  reject(
    "zero rubric dimension despite total10",
    () =>
      verifyReview(result.captures, { indexSha256: fileHash(index) }, index),
    "VISUAL_RUBRIC_FAILED",
  );
  for (const item of bad.captures) {
    item.scores = {
      hierarchy: 1,
      typography: 1,
      colorContrast: 1,
      alignmentSpacing: 2,
      interaction: 2,
      mobile: 2,
    };
    item.total = 9;
  }
  fs.writeFileSync(index, JSON.stringify(bad));
  reject(
    "rubric total below10",
    () =>
      verifyReview(result.captures, { indexSha256: fileHash(index) }, index),
    "VISUAL_RUBRIC_FAILED",
  );
  const variantBad = JSON.parse(fs.readFileSync(manual.indexPath, "utf8"));
  const first = variantBad.captures[0];
  const original = first.path;
  first.path = path.join(temporary, path.basename(original));
  fs.copyFileSync(original, first.path);
  first.approvedVariants = [{ ...first, opened: false }];
  fs.writeFileSync(index, JSON.stringify(variantBad));
  reject(
    "unopened alternative is never an approved baseline",
    () =>
      verifyReview(result.captures, { indexSha256: fileHash(index) }, index),
    "VISUAL_OBSERVATION_MISSING",
  );
  const alternative = first.approvedVariants[0];
  alternative.opened = true;
  alternative.sha256 = "0".repeat(64);
  fs.writeFileSync(index, JSON.stringify(variantBad));
  reject(
    "alternative bytes must match their recorded hash",
    () =>
      verifyReview(result.captures, { indexSha256: fileHash(index) }, index),
    "VISUAL_PIXEL_REVIEW_REQUIRED",
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
fs.writeFileSync(
  "evidence/visual/current/negative-cases.json",
  JSON.stringify(
    {
      status: "PASS",
      observedAt: new Date().toISOString(),
      command: "node tools/visual-self-check.mjs",
      baseline,
      checks,
      sourceFilesMutated: false,
      approvedIndexMutated: false,
      imagesMutated: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    status: "PASS",
    rejectedCases: checks.length,
    baseline: baseline.status,
    releaseReady: false,
  }),
);
