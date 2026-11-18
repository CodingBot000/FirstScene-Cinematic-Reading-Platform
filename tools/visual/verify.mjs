import { browserRuntimeProfile } from "../browser-runtime.mjs";
import { visualCoverage } from "./coverage.mjs";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { sourceFingerprint, checkFingerprint } from "./fingerprint.mjs";
export const fileHash = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const scoreKeys = [
  "hierarchy",
  "typography",
  "colorContrast",
  "alignmentSpacing",
  "interaction",
  "mobile",
];
export function verifyReview(captures, manual, indexPath) {
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  if (
    fileHash(indexPath) !== manual.indexSha256 ||
    index.status !== "AGENT_VISUAL_REVIEW_COMPLETE" ||
    index.reviewer !== "agent" ||
    index.humanReviews !== 0 ||
    index.sourceFingerprint?.sha256 !== sourceFingerprint().sha256
  )
    throw new Error("VISUAL_REVIEW_STALE_OR_INCOMPLETE");
  if (
    captures.length !== visualCoverage.frames ||
    index.captures.length !== visualCoverage.frames ||
    new Set(captures.map((capture) => path.basename(capture.path))).size !==
      visualCoverage.frames
  )
    throw new Error("VISUAL_COVERAGE_INCOMPLETE");
  const approved = new Map(
    index.captures.map((capture) => [path.basename(capture.path), capture]),
  );
  for (const capture of captures) {
    const primary = approved.get(path.basename(capture.path));
    const versions = primary
      ? [primary, ...(primary.approvedVariants ?? [])]
      : [];
    if (!versions.length) throw new Error("VISUAL_OBSERVATION_MISSING");
    for (const review of versions) {
      if (
        review.opened !== true ||
        review.reviewer !== "agent" ||
        !review.observation ||
        !Number.isFinite(Date.parse(review.reviewedAt)) ||
        review.status === "DEFECT_OBSERVED"
      )
        throw new Error("VISUAL_OBSERVATION_MISSING");
      const scores = scoreKeys.map((key) => review.scores?.[key]);
      if (
        scores.some(
          (score) => !Number.isInteger(score) || score <= 0 || score > 2,
        ) ||
        scores.reduce((sum, score) => sum + score, 0) !== review.total ||
        review.total < 10
      )
        throw new Error("VISUAL_RUBRIC_FAILED");
      if (
        !review.path.startsWith(path.dirname(indexPath) + "/") ||
        review.path.includes("..")
      )
        throw new Error("VISUAL_ARTIFACT_PATH_INVALID");
      if (fileHash(review.path) !== review.sha256)
        throw new Error("VISUAL_PIXEL_REVIEW_REQUIRED");
    }
    if (
      !capture.path.startsWith("evidence/visual/current/") ||
      capture.path.includes("..")
    )
      throw new Error("VISUAL_ARTIFACT_PATH_INVALID");
    if (
      fileHash(capture.path) !== capture.sha256 ||
      !versions.some((review) => review.sha256 === capture.sha256)
    )
      throw new Error("VISUAL_PIXEL_REVIEW_REQUIRED");
  }

  const defects = JSON.parse(fs.readFileSync("execution/defects.json", "utf8"));
  if (
    defects.defects.some(
      (defect) =>
        defect.id.startsWith("D-P06-") && defect.status !== "RESOLVED",
    )
  )
    throw new Error("VISUAL_DEFECT_UNRESOLVED");
  return {
    status: "VISUAL_CHECKS_PASSED",
    reviewer: "agent",
    humanReviews: 0,
    captures: visualCoverage.frames,
    minimumRubric: Math.min(
      ...index.captures.flatMap((capture) =>
        [capture, ...(capture.approvedVariants ?? [])].map(
          (version) => version.total,
        ),
      ),
    ),
    nativeZoom: index.nativeZoom,
    releaseReady: false,
    indexPath,
    indexSha256: manual.indexSha256,
  };
}
export function verifyCurrentCapture(result) {
  if (
    result.runtimeProfile !== browserRuntimeProfile() ||
    result.collectionVerified !== true ||
    result.commands?.[0]?.exitCode !== 0
  )
    throw new Error("VISUAL_RECOLLECTION_REQUIRED");
  if (
    result.sourceFingerprint?.sha256 !== sourceFingerprint().sha256 ||
    result.checkFingerprint?.sha256 !== checkFingerprint().sha256 ||
    result.productionBuildId !==
      fs.readFileSync("apps/web/.next/BUILD_ID", "utf8").trim()
  )
    throw new Error("VISUAL_RECOLLECTION_REQUIRED");
  const reportFile = "evidence/visual/current/browser-results.json";
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  if (
    fileHash(reportFile) !== result.browserReportSha256 ||
    !Number.isFinite(Date.parse(report.stats.startTime)) ||
    Date.parse(report.stats.startTime) < Date.parse(result.startedAt) ||
    report.stats.expected !== visualCoverage.groups ||
    report.stats.unexpected ||
    report.stats.skipped ||
    report.stats.flaky
  )
    throw new Error("VISUAL_BROWSER_EVIDENCE_INVALID");
  const manualFile = "evidence/visual/review.json";
  if (!fs.existsSync(manualFile)) throw new Error("VISUAL_REVIEW_REQUIRED");
  const manual = JSON.parse(fs.readFileSync(manualFile, "utf8"));
  if (!/^evidence\/visual\/[a-f0-9]{40}\/index\.json$/.test(manual.indexPath))
    throw new Error("VISUAL_REVIEW_PATH_INVALID");
  return verifyReview(result.captures, manual, manual.indexPath);
}
