import fs from "node:fs";
import { execFileSync } from "node:child_process";

const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const read = (file) =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
const latest = read("evidence/qa/ci-run/latest.json");
const report = /^evidence\/qa\/ci-run\/[a-f0-9TZ-]+\/index\.json$/.test(
  latest?.path ?? "",
)
  ? read(latest.path)
  : null;
const current =
  report?.commit === commit && report.mode === "ci" ? report : null;
const count = (value) => (Number.isInteger(value) && value >= 0 ? value : null);
const version = (value) =>
  typeof value === "string" && /^v?\d+(?:\.\d+){1,4}$/.test(value)
    ? value
    : null;
const suiteIds = new Set([
  "lint",
  "type",
  "boundaries",
  "content",
  "unit",
  "database",
  "api",
  "production-build",
  "storybook",
  "chromium",
  "webkit",
  "accessibility",
  "assets",
  "security-negatives",
  "external-packages",
  "startup",
  "performance",
  "visual",
  "ledger",
]);
const suiteRows = (current?.suites ?? [])
  .filter((row) => suiteIds.has(row.id))
  .map((row) => ({
    id: row.id,
    exitCode: count(row.exitCode),
    executed: row.executed === true,
    reportVerified: row.reportVerified === true,
    passedTests: count(row.tests?.passed ?? row.tests?.expected),
    failedTests: count(row.tests?.failed ?? row.tests?.unexpected),
    skippedTests: count(row.tests?.pending ?? row.tests?.skipped),
  }));
const chromium = read("evidence/ci/host-chromium.json");
const webkit = read("evidence/ci/linux-webkit-input.json");
const image = read("evidence/ci/browser-runtime-image.json");
const smoke = read("evidence/container/smoke.json");
const security = read("evidence/security/current/result.json");
const db = read("evidence/database/test-results.json");
const api = read("evidence/api/environment.json");
const summary = {
  commit,
  observedAt: new Date().toISOString(),
  status:
    current?.automatedPassed === true && suiteRows.length === suiteIds.size
      ? "CI_CHECKS_PASSED"
      : current
        ? "CI_CHECKS_INCOMPLETE_OR_FAILED"
        : "CI_NOT_RECORDED",
  suites: suiteRows,
  runtime: {
    chromium: version(chromium?.browser),
    webkit: current?.suites.some((s) => s.id === "webkit" && s.reportVerified)
      ? version(webkit?.browserVersion)
      : null,
    playwright: version(chromium?.playwright),
    node: version(chromium?.node),
    pnpm: version(chromium?.pnpm),
    imageId: /^sha256:[a-f0-9]{64}$/.test(image?.imageId ?? "")
      ? image.imageId
      : null,
  },
  database:
    current?.suites.some((s) => s.id === "database" && s.reportVerified) &&
    api?.realDatabase === true
      ? {
          isolatedPostgres: true,
          version: version(api.postgresVersion),
          testsPassed: count(db?.numPassedTests),
        }
      : null,
  privateSourceReview:
    security?.sourceCommit === commit &&
    security.checks?.some(
      (c) =>
        c.name === "PUBLIC_PRIVATE_SOURCE_NAME_SCAN" && c.status === "PASS",
    )
      ? "PASS"
      : security?.sourceCommit === commit &&
          security.checks?.some((c) => c.status === "DEFERRED_TO_RELEASE")
        ? "DEFERRED_TO_RELEASE"
        : "UNVERIFIED",
  visual:
    current?.visualReview === "CAPTURES_COLLECTED_REVIEW_REQUIRED"
      ? "CAPTURES_COLLECTED_REVIEW_REQUIRED"
      : "UNVERIFIED",
  containerSmoke:
    smoke?.sourceCommit === commit &&
    smoke.status === "PASS" &&
    smoke.checks?.every((check) => check.passed === true)
      ? { passedChecks: smoke.checks.length }
      : null,
  releaseReady: false,
};
fs.mkdirSync("artifacts/private", { recursive: true });
fs.writeFileSync(
  "artifacts/private/ci-public-summary.json",
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(
  JSON.stringify({ status: summary.status, suites: suiteRows.length, commit }),
);
