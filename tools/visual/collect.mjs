import {
  browserRuntimeProfile,
  useLinuxWebkit,
  runLinuxWebkit,
  mergeBrowserReports,
} from "../browser-runtime.mjs";
import { visualCoverage } from "./coverage.mjs";
import fs from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { withProductionServer } from "../performance/server.mjs";
import { sourceFingerprint, checkFingerprint } from "./fingerprint.mjs";
import { verifyCurrentCapture, fileHash } from "./verify.mjs";
const directory = "evidence/visual/current";
fs.mkdirSync(directory, { recursive: true });
const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (
  args.some((arg) => !["--collect", "--verify-review"].includes(arg)) ||
  args.length > 1
)
  throw new Error("VISUAL_MODE_INVALID");
if (args.includes("--verify-review")) {
  const file = directory + "/result.json";
  const previous = JSON.parse(fs.readFileSync(file, "utf8"));
  try {
    previous.review = verifyCurrentCapture(previous);
    previous.status = "VISUAL_CHECKS_PASSED";
    delete previous.error;
  } catch (error) {
    previous.status = "REVIEW_REQUIRED";
    delete previous.review;
    previous.error = /^[A-Z_]+$/.test(error.message)
      ? error.message
      : "VISUAL_REVIEW_INVALID";
    process.exitCode = 2;
  }
  previous.reviewCheckedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(previous, null, 2) + "\n");
  console.log(
    JSON.stringify({
      status: previous.status,
      error: previous.error,
      report: file,
      releaseReady: false,
    }),
  );
  process.exit(process.exitCode ?? 0);
}
for (const name of ["captures.json", "browser-results.json"])
  if (fs.existsSync(directory + "/" + name))
    fs.unlinkSync(directory + "/" + name);
const result = {
  status: "IN_PROGRESS",
  releaseReady: false,
  runtimeProfile: browserRuntimeProfile(),
  reviewer: null,
  startedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  commands: [],
  captures: [],
  sourceFingerprint: sourceFingerprint(),
  checkFingerprint: checkFingerprint(),
  productionBuildId: fs.readFileSync("apps/web/.next/BUILD_ID", "utf8").trim(),
  scope:
    "Viewport rendering/keyboard/axe and agent visual rubric. Native200%zoom and human usability review are separate.",
};
const write = () =>
  fs.writeFileSync(
    directory + "/result.json",
    JSON.stringify(result, null, 2) + "\n",
  );
write();
try {
  await withProductionServer(async ({ origin, database }) => {
    result.database = {
      name: database,
      real: true,
      fresh: true,
      authBypass: false,
    };
    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      LANG: "ko_KR.UTF-8",
      FIRSTSCENE_VISUAL_ORIGIN: origin,
    };
    let exitCode = await new Promise((resolve) => {
      const child = spawn(
        "pnpm",
        [
          "exec",
          "playwright",
          "test",
          "--config=tools/visual-playwright.config.ts",
          ...(useLinuxWebkit()
            ? [
                "--project=visual1440",
                "--project=visual1024",
                "--project=visual390",
                "--project=visual320",
              ]
            : []),
        ],
        { env, stdio: "inherit" },
      );
      child.on("error", () => resolve(1));
      child.on("exit", (code) => resolve(code ?? 1));
    });
    if (useLinuxWebkit()) {
      const hostReport = JSON.parse(
        fs.readFileSync(directory + "/browser-results.json"),
      );
      const hostCaptures = JSON.parse(
        fs.readFileSync(directory + "/captures.json"),
      );
      const linux = await runLinuxWebkit("visual");
      const linuxCaptures = JSON.parse(
        fs.readFileSync(directory + "/captures.json"),
      );
      fs.writeFileSync(
        directory + "/browser-results.json",
        JSON.stringify(
          mergeBrowserReports([hostReport, linux.report]),
          null,
          2,
        ) + "\n",
      );
      fs.writeFileSync(
        directory + "/captures.json",
        JSON.stringify([...hostCaptures, ...linuxCaptures], null, 2) + "\n",
      );
      exitCode = exitCode || linux.exitCode;
      result.browserRuntimeImage = JSON.parse(
        fs.readFileSync("evidence/ci/browser-runtime-image.json"),
      );
    }
    result.commands.push({
      command: "playwright test --config=tools/visual-playwright.config.ts",
      exitCode,
    });
    const report = JSON.parse(
      fs.readFileSync(directory + "/browser-results.json", "utf8"),
    );
    if (
      exitCode ||
      report.stats.expected !== visualCoverage.groups ||
      report.stats.unexpected ||
      report.stats.skipped ||
      report.stats.flaky
    )
      throw new Error("VISUAL_BROWSER_CHECKS_FAILED");
    result.browserReportSha256 = fileHash(directory + "/browser-results.json");
    result.captures = JSON.parse(
      fs.readFileSync(directory + "/captures.json", "utf8"),
    );
    for (const capture of result.captures)
      if (
        createHash("sha256")
          .update(fs.readFileSync(capture.path))
          .digest("hex") !== capture.sha256
      )
        throw new Error("VISUAL_CAPTURE_HASH_MISMATCH");
  });
  if (
    result.captures.length !== visualCoverage.frames ||
    new Set(result.captures.map((capture) => capture.path)).size !==
      visualCoverage.frames
  )
    throw new Error("VISUAL_COVERAGE_INCOMPLETE");
  if (
    result.sourceFingerprint.sha256 !== sourceFingerprint().sha256 ||
    result.checkFingerprint.sha256 !== checkFingerprint().sha256
  )
    throw new Error("VISUAL_SOURCE_CHANGED_DURING_CAPTURE");
  result.collectionVerified = true;
  result.status = "CAPTURES_COLLECTED_REVIEW_REQUIRED";
  if (!args.includes("--collect")) {
    try {
      result.review = verifyCurrentCapture(result);
      result.status = "VISUAL_CHECKS_PASSED";
    } catch (error) {
      result.status = "REVIEW_REQUIRED";
      result.error = /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "VISUAL_REVIEW_INVALID";
      process.exitCode = 2;
    }
  }
} catch (error) {
  result.status = "FAILED";
  result.error = /^[A-Z_]+$/.test(error.message)
    ? error.message
    : "VISUAL_COLLECTION_FAILED";
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  write();
  console.log(
    JSON.stringify({
      status: result.status,
      report: directory + "/result.json",
      releaseReady: false,
    }),
  );
}
