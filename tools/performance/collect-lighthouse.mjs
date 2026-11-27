import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { runAudit } from "./lighthouse-runner.mjs";
import config from "./lighthouse.config.mjs";
import { withProductionServer } from "./server.mjs";

const directory = "evidence/performance/current";
fs.mkdirSync(directory, { recursive: true });
const resultFile = path.join(directory, "navigation.json");
const result = {
  status: "IN_PROGRESS",
  coverage:
    "navigation-only; interaction and leak gates are separate and still required",
  releaseReady: false,
  observedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  productionBuildId: fs.readFileSync("apps/web/.next/BUILD_ID", "utf8").trim(),
  environment: {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpu: os.cpus()[0]?.model,
    node: process.version,
  },
  config,
  runs: [],
  summary: [],
};
function write() {
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2) + "\n");
}
write();
const digest = (data) => createHash("sha256").update(data).digest("hex");
const median = (values) => [...values].sort((a, b) => a - b)[1];
const metricNames = [
  "largest-contentful-paint",
  "cumulative-layout-shift",
  "total-blocking-time",
  "first-contentful-paint",
  "speed-index",
  "total-byte-weight",
];
const diagnosticNames = [
  "layout-shifts",
  "layout-shift-elements",
  "network-requests",
  "font-display-insight",
  "lcp-discovery-insight",
  "lcp-breakdown-insight",
];

try {
  await withProductionServer(async ({ origin, database }) => {
    result.database = {
      name: database,
      real: true,
      fresh: true,
      authBypass: false,
    };
    for (const [route, pathname] of [
      ["home", "/"],
      ["introduction", "/stories/post-office"],
      ["reader", "/read/post-office"],
    ]) {
      for (let index = 1; index <= 3; index++) {
        const reportFile = path.join(directory, `${route}-${index}.raw.json`);
        const command = [
          "node_modules/lighthouse/cli/index.js",
          origin + pathname,
          "--config-path=tools/performance/lighthouse.config.mjs",
          "--output=json",
          `--output-path=${reportFile}`,
          "--quiet",
          "--no-enable-error-reporting",
        ];
        // No application/database/API credentials are inherited by Chromium or Lighthouse.
        const env = {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          LANG: "ko_KR.UTF-8",
        };
        const code = await runAudit(command, env);
        if (code) throw new Error("LIGHTHOUSE_PROCESS_FAILED");
        const raw = fs.readFileSync(reportFile);
        const lhr = JSON.parse(raw);
        if (lhr.runtimeError) throw new Error("LIGHTHOUSE_RUNTIME_ERROR");
        const metrics = Object.fromEntries(
          metricNames.map((name) => {
            const audit = lhr.audits[name];
            if (!Number.isFinite(audit?.numericValue))
              throw new Error("LIGHTHOUSE_METRIC_MISSING");
            return [name, audit.numericValue];
          }),
        );
        const requests = lhr.audits["network-requests"].details.items;
        const scriptPaths = [
          ...new Set(
            requests
              .filter((r) => r.resourceType === "Script")
              .map((r) => new URL(r.url).pathname),
          ),
        ];
        let jsGzipBytes = 0;
        for (const url of scriptPaths) {
          if (!url.startsWith("/_next/static/") || url.includes(".."))
            throw new Error("UNEXPECTED_SCRIPT_RESOURCE");
          jsGzipBytes += gzipSync(
            fs.readFileSync(
              path.join(
                "apps/web/.next/static",
                url.slice("/_next/static/".length),
              ),
            ),
            { level: 9 },
          ).length;
        }
        const fontsTransferBytes = requests
          .filter((r) => r.resourceType === "Font")
          .reduce((sum, r) => sum + r.transferSize, 0);
        const auditFile = path.join(directory, `${route}-${index}.json`);
        const retained = {
          lighthouseVersion: lhr.lighthouseVersion,
          fetchTime: lhr.fetchTime,
          requestedUrl: lhr.requestedUrl,
          finalDisplayedUrl: lhr.finalDisplayedUrl,
          environment: lhr.environment,
          configSettings: lhr.configSettings,
          runWarnings: lhr.runWarnings,
          audits: Object.fromEntries(
            [...metricNames, ...diagnosticNames]
              .filter((name) => lhr.audits[name])
              .map((name) => [name, lhr.audits[name]]),
          ),
        };
        fs.writeFileSync(auditFile, JSON.stringify(retained, null, 2) + "\n");
        result.runs.push({
          route,
          pathname,
          index,
          metrics,
          jsGzipBytes,
          fontsTransferBytes,
          scriptPaths,
          rawSha256: digest(raw),
          audit: auditFile,
          auditSha256: digest(fs.readFileSync(auditFile)),
        });
        write();
        console.log(
          JSON.stringify({
            route,
            run: index,
            lcpMs: Math.round(metrics[metricNames[0]]),
            cls: metrics[metricNames[1]],
            tbtMs: Math.round(metrics[metricNames[2]]),
            jsGzipBytes,
            fontsTransferBytes,
          }),
        );
      }
    }
    for (const route of ["home", "introduction", "reader"]) {
      const runs = result.runs.filter((run) => run.route === route);
      const metrics = Object.fromEntries(
        metricNames.map((name) => [
          name,
          median(runs.map((run) => run.metrics[name])),
        ]),
      );
      const violations = [];
      if (metrics[metricNames[0]] > 2500) violations.push("LCP_GT_2500MS");
      if (metrics[metricNames[1]] > 0.1) violations.push("CLS_GT_0_1");
      if (metrics[metricNames[2]] > 200) violations.push("TBT_GT_200MS");
      if (
        Math.max(...runs.map((r) => r.metrics["total-byte-weight"])) >
        1.4 * 1024 * 1024
      )
        violations.push("TRANSFER_GT_1_4MIB");
      if (Math.max(...runs.map((r) => r.fontsTransferBytes)) > 300 * 1024)
        violations.push("FONTS_GT_300KIB");
      if (
        route === "reader" &&
        Math.max(...runs.map((r) => r.jsGzipBytes)) > 300 * 1024
      )
        violations.push("READER_JS_GZIP_GT_300KIB");
      result.summary.push({ route, median: metrics, violations });
    }
  });
  result.status = result.summary.some((row) => row.violations.length)
    ? "BUDGET_FAILED"
    : "NAVIGATION_BUDGETS_PASSED";
  if (result.status === "BUDGET_FAILED") process.exitCode = 1;
} catch (error) {
  result.status = "COLLECTION_FAILED";
  result.error = /^[A-Z_]+$/.test(error.message)
    ? error.message
    : "PERFORMANCE_COLLECTION_ERROR";
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  write();
}
