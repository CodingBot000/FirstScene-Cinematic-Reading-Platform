import { visualCoverage } from "./visual/coverage.mjs";
import fs from "node:fs";
import {
  assertExecutedBrowserReport,
  assertExecutedPerformance,
} from "./suite-evidence.mjs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import { sourceFingerprint } from "./visual/fingerprint.mjs";
const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (
  args.some((arg) => !["--collect", "--ci", "--qa"].includes(arg)) ||
  args.length > 1
)
  throw new Error("FULL_MODE_INVALID");
const collect = args.includes("--collect");
const ci = args.includes("--ci");
const qa = args.includes("--qa");
const strict = !collect && !ci && !qa;
const reportRoot = ci
  ? "evidence/qa/ci-run"
  : qa
    ? "evidence/qa/product-qa"
    : "evidence/qa/full-run";
const directory =
  reportRoot +
  "/" +
  new Date().toISOString().replace(/[:.]/g, "-") +
  "-" +
  randomUUID().slice(0, 8);
fs.mkdirSync(directory, { recursive: true });
const hash = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const secretValues = new Set();
for (const values of [
  process.env,
  ...[".env.local", "apps/web/.env.local"]
    .filter(fs.existsSync)
    .map((file) => parseEnv(fs.readFileSync(file, "utf8"))),
])
  for (const [key, value] of Object.entries(values))
    if (
      value &&
      value.length >= 24 &&
      /(?:SECRET|PASSWORD|DATABASE_URL|TOKEN|API_KEY)/.test(key)
    ) {
      secretValues.add(value);
      if (/DATABASE_URL/.test(key)) {
        try {
          const password = decodeURIComponent(new URL(value).password);
          if (password.length >= 24) secretValues.add(password);
        } catch {
          /* Not a URL. */
        }
      }
    }
const redact = (value) => {
  for (const secret of secretValues)
    value = value.replaceAll(secret, "<redacted>");
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "<redacted-database-url>")
    .replace(
      /(?:firstscene_dev|__Host-firstscene)=[A-Za-z0-9_-]{43}/g,
      "<redacted-session-cookie>",
    );
};
function checkCodeFingerprint() {
  const walk = (directory) =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isSymbolicLink() || entry.name === "__pycache__"
        ? []
        : entry.isDirectory()
          ? walk(file)
          : /\.(?:mjs|ts|tsx|py|ya?ml)$/.test(file)
            ? [file]
            : [];
    });
  const files = [
    ...["tools", "tests", ".github"].flatMap(walk),
    "Dockerfile.qa",
    "execution/browser-runtime-lock.json",
    ...fs
      .readdirSync(".")
      .filter(
        (file) =>
          /\.(?:config\.(?:ts|mjs)|json|ya?ml)$/.test(file) &&
          fs.statSync(file).isFile(),
      ),
  ].sort();
  return {
    files: files.length,
    sha256: createHash("sha256")
      .update(JSON.stringify(files.map((file) => [file, hash(file)])))
      .digest("hex"),
  };
}
const report = {
  schemaVersion: 1,
  status: "IN_PROGRESS",
  mode: ci ? "ci" : qa ? "qa" : collect ? "collect" : "strict",
  startedAt: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  sourceFingerprint: sourceFingerprint(),
  checkFingerprint: checkCodeFingerprint(),
  suites: [],
  releaseReady: false,
  localProductReady: false,
  publicReleaseReady: false,
  collectionErrors: [],
  qualityFailures: [],
  manualBlockers: [],
  manualGatesEvaluated: strict,
  visualReview: "NOT_EVALUATED",
};
const save = () =>
  fs.writeFileSync(
    directory + "/index.json",
    JSON.stringify(report, null, 2) + "\n",
  );
const specs = [
  ["lint", ["lint"]],
  ["type", ["typecheck"]],
  ["boundaries", ["check:boundaries"]],
  ["content", ["content:check"], "evidence/content/compiler.json"],
  [
    "unit",
    [
      "exec",
      "vitest",
      "run",
      "--reporter=json",
      "--outputFile=" + directory + "/unit-results.json",
    ],
    directory + "/unit-results.json",
    "vitest",
  ],
  ["database", ["test:db"], "evidence/database/test-results.json", "vitest"],
  ["production-build", ["build"]],
  ["api", ["test:api"], "evidence/api/test-results.json", "playwright"],
  ["storybook", ["storybook:build"]],
  [
    "chromium",
    ["test:e2e"],
    "evidence/qa/playwright-results.json",
    "playwright",
  ],
  [
    "webkit",
    ["test:e2e:webkit"],
    "evidence/qa/playwright-results.json",
    "playwright",
  ],
  [
    "accessibility",
    ["test:a11y"],
    "evidence/qa/playwright-results.json",
    "playwright",
  ],
  ["assets", ["assets:verify", "--", "--release"]],
  [
    "security-negatives",
    ci ? ["test:security", "--", "--portable"] : ["test:security"],
    "evidence/security/current/result.json",
    "security",
  ],
  [
    "external-packages",
    ["pack:smoke"],
    "evidence/package-consumer/result.json",
    "consumer",
  ],
  ["startup", ["test:startup"], "evidence/container/startup.json"],
  [
    "performance",
    ["test:perf"],
    "evidence/performance/current/result.json",
    "performance",
  ],
  [
    "visual",
    strict ? ["test:visual"] : ["test:visual", "--", "--collect"],
    "evidence/visual/current/result.json",
    "visual",
  ],
  ["ledger", ["check:state"]],
];
save();
for (const [id, commandArgs, artifact, kind] of specs) {
  const row = {
    id,
    command: "pnpm " + commandArgs.join(" "),
    startedAt: new Date().toISOString(),
    exitCode: null,
    executed: false,
    artifacts: [],
    reportVerified: false,
  };
  report.suites.push(row);
  save();
  if (artifact && fs.existsSync(artifact)) fs.unlinkSync(artifact);
  let output = "";
  row.exitCode = await new Promise((resolve) => {
    const child = spawn("pnpm", commandArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.once("spawn", () => {
      row.executed = true;
    });
    child.stdout.on("data", (value) => {
      output += value;
    });
    child.stderr.on("data", (value) => {
      output += value;
    });
    child.once("error", () => resolve(1));
    child.once("exit", (code) => resolve(code ?? 1));
  });
  row.finishedAt = new Date().toISOString();
  const log = directory + "/" + id + ".txt";
  fs.writeFileSync(log, redact(output));
  row.artifacts.push({ path: log, sha256: hash(log) });
  if (!row.executed) report.collectionErrors.push(id + ":NOT_EXECUTED");
  try {
    if (artifact) {
      if (fs.statSync(artifact).mtimeMs < Date.parse(row.startedAt))
        throw new Error();
      const value = JSON.parse(fs.readFileSync(artifact));
      const copy = directory + "/" + id + ".json";
      fs.writeFileSync(copy, redact(JSON.stringify(value, null, 2)) + "\n");
      row.artifacts.push({ path: copy, sha256: hash(copy) });
      if (kind === "playwright")
        assertExecutedBrowserReport(
          value,
          { api: 25, chromium: 47, webkit: 47, accessibility: 2 }[id],
        );
      if (kind === "consumer") {
        const browser = JSON.parse(
          fs.readFileSync("evidence/package-consumer/browser-results.json"),
        );
        assertExecutedBrowserReport(browser, 2);
        if (Date.parse(browser.stats.startTime) < Date.parse(row.startedAt))
          throw new Error("STALE_CONSUMER_REPORT");
      }
      if (kind === "performance") {
        const navigation = JSON.parse(
          fs.readFileSync("evidence/performance/current/navigation.json"),
        );
        const browser = JSON.parse(
          fs.readFileSync("evidence/performance/current/browser-results.json"),
        );
        if (Date.parse(browser.stats.startTime) < Date.parse(row.startedAt))
          throw new Error("STALE_NESTED_REPORT");
        assertExecutedPerformance(navigation, browser);
      }
      if (kind === "security") {
        const unit = JSON.parse(
          fs.readFileSync("evidence/security/current/unit-results.json"),
        );
        const api = JSON.parse(
          fs.readFileSync("evidence/security/current/test-results.json"),
        );
        if (
          !unit.numTotalTests ||
          unit.numPendingTests ||
          unit.startTime < Date.parse(row.startedAt) ||
          Date.parse(api.stats.startTime) < Date.parse(row.startedAt)
        )
          throw new Error("SECURITY_SUBSUITE_NOT_EXECUTED");
        assertExecutedBrowserReport(api, 25);
      }
      if (kind === "playwright") {
        if (
          !value.stats ||
          value.stats.expected + value.stats.unexpected + value.stats.skipped <=
            0 ||
          Date.parse(value.stats.startTime) < Date.parse(row.startedAt)
        )
          throw new Error();
        row.tests = value.stats;
        if (value.stats.unexpected || value.stats.skipped || value.stats.flaky)
          report.qualityFailures.push(id + ":TESTS_NOT_PASSED");
      }
      if (kind === "vitest") {
        if (
          !value.numTotalTests ||
          value.numPendingTests ||
          !Number.isFinite(Number(value.startTime)) ||
          Number(value.startTime) < Date.parse(row.startedAt)
        )
          throw new Error();
        row.tests = {
          total: value.numTotalTests,
          passed: value.numPassedTests,
          failed: value.numFailedTests,
          pending: value.numPendingTests,
        };
        if (!value.success || value.numPendingTests || value.numFailedTests)
          report.qualityFailures.push(id + ":TESTS_NOT_PASSED");
      }
      if (kind === "visual") {
        if (
          !value.collectionVerified ||
          value.captures.length !== visualCoverage.frames ||
          value.commands?.[0]?.exitCode
        )
          throw new Error();
        report.visualReview = value.status;
        if (
          value.status !==
          (strict
            ? "VISUAL_CHECKS_PASSED"
            : "CAPTURES_COLLECTED_REVIEW_REQUIRED")
        )
          report.qualityFailures.push(
            id + (strict ? ":MANUAL_REVIEW_REQUIRED" : ":CAPTURE_FAILED"),
          );
      }
      if (
        kind === "performance" &&
        (!value.commands?.length ||
          value.commands.some((command) => command.exitCode !== 0))
      )
        report.qualityFailures.push(id + ":PERFORMANCE_FAILED");
      if (
        kind === "security" &&
        (value.status !==
          (ci
            ? "PORTABLE_SECURITY_NEGATIVES_PASSED"
            : "AUTOMATED_SECURITY_NEGATIVES_PASSED") ||
          ![
            "ACTUAL_NEGATIVE_REPORTS",
            "TRACKED_CREDENTIAL_AND_PATH_SCAN",
            "PRODUCTION_CLIENT_BUNDLE_SCAN",
            "NO_RUNTIME_AUTH_OR_MOCK_TEST_BYPASS",
          ].every((name) =>
            value.checks?.some(
              (check) => check.name === name && check.status === "PASS",
            ),
          ) ||
          !value.checks?.some(
            (check) =>
              check.name === "PUBLIC_PRIVATE_SOURCE_NAME_SCAN" &&
              (check.status === "PASS" ||
                (ci && check.status === "DEFERRED_TO_RELEASE")),
          ))
      )
        report.qualityFailures.push(id + ":NEGATIVES_FAILED");
      // Bind nested producer artifacts before later producers can overwrite mutable paths.
      for (const [index, item] of (value.artifacts ?? []).entries())
        if (item.path && item.sha256) {
          if (hash(item.path) !== item.sha256) throw new Error();
          const nested =
            directory + "/" + id + "-" + index + "-" + path.basename(item.path);
          fs.copyFileSync(item.path, nested);
          row.artifacts.push({
            path: nested,
            sha256: hash(nested),
            producerPath: item.path,
          });
        }
    } else if (!output.length) throw new Error();
    row.reportVerified = true;
  } catch {
    report.collectionErrors.push(id + ":REPORT_MISSING_STALE_OR_INCOMPLETE");
  }
  if (row.exitCode) report.qualityFailures.push(id + ":EXIT_" + row.exitCode);
  // CI must expose a bounded, redacted failure summary; without this,
  // individual browser failures are buried in private runner artifacts.
  if (ci && row.exitCode && ["chromium", "webkit", "visual"].includes(id)) {
    const diagnostic = redact(output)
      .split("\n")
      .filter((line) =>
        /(?:Error:|failed|FAIL|✘|×|expect\(|Assertion|Timed out|timeout|scroll-chapters|discovery-catalog|\d+ passed|\d+ failed|\d+ unexpected|Visual)/i.test(
          line,
        ),
      )
      .slice(-55)
      .map((line) => line.slice(0, 450))
      .join("\n");
    console.log("CI_DIAGNOSTIC_" + id.toUpperCase() + "\n" + diagnostic);
  }
  save();
  console.log(
    JSON.stringify({
      suite: id,
      exitCode: row.exitCode,
      reportVerified: row.reportVerified,
      report: directory + "/index.json",
    }),
  );
}
if (report.checkFingerprint.sha256 !== checkCodeFingerprint().sha256)
  report.collectionErrors.push("CHECK_CODE_CHANGED_DURING_FULL_RUN");
if (report.sourceFingerprint.sha256 !== sourceFingerprint().sha256)
  report.collectionErrors.push("SOURCE_CHANGED_DURING_FULL_RUN");
const state = JSON.parse(fs.readFileSync("execution/tasks.json"));
const futureGateTasks = new Set([
  "P07-T01",
  "P07-T02",
  "P07-T03",
  "P08-T01",
  "P08-T02",
]);
report.incompletePrerequisites = strict
  ? state.tasks
      .filter(
        (task) =>
          task.gate === "local" &&
          !futureGateTasks.has(task.id) &&
          task.status !== "DONE",
      )
      .map((task) => task.id)
  : [];
for (const file of strict
  ? [
      "evidence/responsive/native-zoom-blocker.json",
      "evidence/security/managed-scan-preflight.json",
    ]
  : []) {
  if (!fs.existsSync(file)) {
    report.manualBlockers.push({ file, status: "MISSING_EVIDENCE" });
    continue;
  }
  const value = JSON.parse(fs.readFileSync(file));
  if (
    !value.completed &&
    !["PASS", "PASSED", "COMPLETED"].includes(value.status)
  )
    report.manualBlockers.push({
      file,
      status: value.status ?? "UNVERIFIED",
      sha256: hash(file),
    });
}
report.allSuitesExecuted =
  report.suites.length === specs.length &&
  report.suites.every((suite) => suite.executed && suite.reportVerified);
report.automatedPassed =
  report.allSuitesExecuted &&
  !report.collectionErrors.length &&
  !report.qualityFailures.length;
report.strictQualityPassed =
  strict &&
  report.automatedPassed &&
  !report.manualBlockers.length &&
  !report.incompletePrerequisites.length;
report.localProductReady =
  report.strictQualityPassed &&
  state.tasks
    .filter((task) => task.gate === "local")
    .every((task) => task.status === "DONE");
report.releaseReady = report.localProductReady;
report.status = ci
  ? report.automatedPassed
    ? "CI_CHECKS_PASSED"
    : "CI_CHECKS_FAILED"
  : qa
    ? report.automatedPassed
      ? "PRODUCT_QA_AUTOMATION_PASSED"
      : "PRODUCT_QA_AUTOMATION_FAILED"
    : collect
      ? report.allSuitesExecuted && !report.collectionErrors.length
        ? "RESULTS_COLLECTED"
        : "COLLECTION_FAILED"
      : report.strictQualityPassed
        ? "LOCAL_QUALITY_GATES_PASSED"
        : "LOCAL_GATES_BLOCKED";
if (collect) {
  report.localProductReady = false;
  report.releaseReady = false;
}
report.finishedAt = new Date().toISOString();
save();
fs.writeFileSync(
  reportRoot + "/latest.json",
  JSON.stringify(
    {
      path: directory + "/index.json",
      sha256: hash(directory + "/index.json"),
      status: report.status,
      releaseReady: report.releaseReady,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    status: report.status,
    suites: report.suites.length,
    report: directory + "/index.json",
    releaseReady: report.releaseReady,
  }),
);
process.exitCode =
  ci || qa
    ? report.automatedPassed
      ? 0
      : 1
    : collect
      ? report.status === "RESULTS_COLLECTED"
        ? 0
        : 1
      : report.strictQualityPassed
        ? 0
        : 2;
