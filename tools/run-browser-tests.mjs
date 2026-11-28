import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  useLinuxWebkit,
  runLinuxWebkit,
  mergeBrowserReports,
} from "./browser-runtime.mjs";
import { isolatedDatabase } from "./database/isolated.mjs";
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const api = args.includes("--api");
const singleBatch = args.includes("--single-batch");
const forwarded = args.filter(
  (arg) => !["--api", "--single-batch"].includes(arg),
);
const output =
  process.env.FIRSTSCENE_BROWSER_REPORT ??
  "evidence/qa/playwright-results.json";
if (!api && useLinuxWebkit() && forwarded.includes("--project=webkit")) {
  const result = await runLinuxWebkit("functional", {
    testArgs: forwarded.filter((arg) => arg !== "--project=webkit"),
  });
  fs.writeFileSync(output, JSON.stringify(result.report, null, 2) + "\n");
  process.exit(result.exitCode);
}
const projects = forwarded.filter((arg) => arg.startsWith("--project="));
if (
  !api &&
  !singleBatch &&
  projects.length === 1 &&
  forwarded.every(
    (arg) => arg.startsWith("--project=") || arg.startsWith("--config="),
  )
) {
  const files = fs
    .readdirSync("tests/e2e")
    .filter(
      (file) =>
        /\.spec\.[cm]?[jt]sx?$/.test(file) &&
        (projects[0] !== "--project=webkit" ||
          !file.endsWith(".chromium.spec.ts")),
    )
    .sort()
    .map((file) => "tests/e2e/" + file);
  const directory =
    "evidence/qa/suites/" + projects[0].slice(10) + "-" + randomUUID();
  fs.mkdirSync(directory, { recursive: true });
  const reports = [],
    environments = [];
  let failed = false;
  for (let i = 0; i < files.length; i += 4) {
    const partOutput = path.resolve(
      directory,
      `part-${reports.length + 1}.json`,
    );
    const partEnvironment = path.resolve(
      directory,
      `environment-${reports.length + 1}.json`,
    );
    const code = await new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [
          "tools/run-browser-tests.mjs",
          "--single-batch",
          ...forwarded,
          ...files.slice(i, i + 4),
        ],
        {
          stdio: "inherit",
          env: {
            ...process.env,
            FIRSTSCENE_BROWSER_REPORT: partOutput,
            FIRSTSCENE_ENVIRONMENT_REPORT: partEnvironment,
          },
        },
      );
      child.on("error", () => resolve(1));
      child.on("exit", (code) => resolve(code ?? 1));
    });
    if (code) failed = true;
    if (!fs.existsSync(partOutput))
      throw new Error("BROWSER_BATCH_REPORT_MISSING");
    const report = JSON.parse(fs.readFileSync(partOutput));
    reports.push(report);
    fs.writeFileSync(
      `${directory}/part-${reports.length}.json`,
      JSON.stringify(report, null, 2) + "\n",
    );
    const environment = JSON.parse(fs.readFileSync(partEnvironment));
    environments.push(environment);
  }
  const merged = mergeBrowserReports(reports);
  merged.firstsceneEnvironment = {
    isolation:
      "Fresh owned PostgreSQL per independent4filebatch; approved limits retained; no retry/skip",
    databases: environments,
    realDatabase: true,
    authBypass: false,
  };
  fs.writeFileSync(output, JSON.stringify(merged, null, 2) + "\n");
  fs.writeFileSync(
    directory + "/combined.json",
    JSON.stringify(merged, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      status: failed ? "FAILED" : "COLLECTED",
      report: directory + "/combined.json",
      stats: merged.stats,
    }),
  );
  process.exit(
    failed ||
      merged.stats.unexpected ||
      merged.stats.skipped ||
      merged.stats.flaky
      ? 1
      : 0,
  );
}
let db;
let requestLogDirectory;
try {
  db = await isolatedDatabase();
  const origin = process.env.FIRSTSCENE_TEST_ORIGIN ?? "http://127.0.0.1:3110";
  const url = new URL(origin);
  if (
    url.hostname !== "127.0.0.1" ||
    url.protocol !== "http:" ||
    url.origin !== origin
  )
    throw new Error("LOOPBACK_TEST_ORIGIN_REQUIRED");
  if (!api)
    requestLogDirectory = fs.mkdtempSync(
      path.join(tmpdir(), "firstscene-requests-"),
    );
  const env = {
    ...process.env,
    DATABASE_URL: db.runtimeUrl,
    DIRECT_DATABASE_URL: db.directUrl,
    APP_ORIGIN: origin,
    DEPLOY_TARGET: "local",
    RATE_LIMIT_HMAC_SECRET: randomBytes(32).toString("hex"),
    FIRSTSCENE_TEST_ORIGIN: origin,
    FIRSTSCENE_TEST_KIND: api ? "api" : "browser",
    FIRSTSCENE_TEST_REQUEST_LOG: requestLogDirectory
      ? path.join(requestLogDirectory, "preferences.ndjson")
      : "",
  };
  const report = {
    observedAt: new Date().toISOString(),
    database: db.name,
    postgresVersion: (await db.owner.query("SHOW server_version")).rows[0]
      .server_version,
    origin,
    realDatabase: true,
    authBypass: false,
    ownerCredentialsRemovedFromWebServer: true,
  };
  fs.mkdirSync(api ? "evidence/api" : "evidence/qa", { recursive: true });
  if (process.env.FIRSTSCENE_ENVIRONMENT_REPORT)
    fs.mkdirSync(path.dirname(process.env.FIRSTSCENE_ENVIRONMENT_REPORT), {
      recursive: true,
    });
  fs.writeFileSync(
    process.env.FIRSTSCENE_ENVIRONMENT_REPORT ??
      (api ? "evidence/api" : "evidence/qa") + "/environment.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  const code = await new Promise((resolve) => {
    const child = spawn(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        ...(api ? ["--project=api"] : []),
        ...forwarded,
      ],
      { stdio: "inherit", env },
    );
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = code;
} catch (error) {
  console.error(
    JSON.stringify({
      status: "BROWSER_TEST_ENVIRONMENT_FAILED",
      code: error.code ?? "TEST_ENVIRONMENT_FAILURE",
    }),
  );
  process.exitCode = 1;
} finally {
  if (db)
    try {
      await db.cleanup();
    } catch {
      console.error("ISOLATED_TEST_DATABASE_CLEANUP_FAILED");
      process.exitCode = 1;
    }
  if (requestLogDirectory)
    fs.rmSync(requestLogDirectory, { recursive: true, force: true });
}
