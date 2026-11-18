import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { ownedCiReceipt, privateEnvironment } from "./database/ci-service.mjs";
export const useLinuxWebkit = () =>
  (process.platform === "darwin" || process.platform === "linux") &&
  process.env.FIRSTSCENE_LINUX_WEBKIT === "1";
export const browserRuntimeProfile = () =>
  useLinuxWebkit()
    ? `${process.platform === "darwin" ? "mac" : "linux"}-chromium/linux-webkit`
    : "host";
export function mergeBrowserReports(reports) {
  if (
    !reports.length ||
    reports.some(
      (r) =>
        !r?.stats ||
        !Number.isFinite(Date.parse(r.stats.startTime)) ||
        ["expected", "unexpected", "skipped", "flaky", "duration"].some(
          (key) => !Number.isFinite(r.stats[key]) || r.stats[key] < 0,
        ),
    )
  )
    throw new Error("BROWSER_REPORT_MISSING");
  const merged = {
    ...reports[0],
    suites: reports.flatMap((r) => r.suites ?? []),
    errors: reports.flatMap((r) => r.errors ?? []),
  };
  merged.stats = {
    startTime: reports.map((r) => r.stats.startTime).sort()[0],
    duration: reports.reduce((n, r) => n + r.stats.duration, 0),
    expected: 0,
    unexpected: 0,
    skipped: 0,
    flaky: 0,
  };
  for (const key of ["expected", "unexpected", "skipped", "flaky"])
    merged.stats[key] = reports.reduce((n, r) => n + r.stats[key], 0);
  merged.firstsceneReports = reports.map((r) => ({
    stats: r.stats,
    environment: r.firstsceneEnvironment ?? r.firstsceneReports ?? null,
  }));
  return merged;
}
const root = path.resolve(import.meta.dirname, "..");
const sha = (p) =>
  createHash("sha256").update(fs.readFileSync(p)).digest("hex");
async function docker(args) {
  return new Promise((resolve) => {
    let stdout = "",
      stderr = "";
    const c = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    c.stdout.on("data", (v) => (stdout += v));
    c.stderr.on("data", (v) => (stderr += v));
    c.on("error", () =>
      resolve({ code: 1, stdout, stderr: "DOCKER_COMMAND_UNAVAILABLE" }),
    );
    c.on("exit", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
export async function runLinuxWebkit(
  mode,
  { consumerDirectory, testArgs = [] } = {},
) {
  if (!["functional", "visual", "performance", "consumer"].includes(mode))
    throw new Error("QA_MODE_INVALID");
  const lock = JSON.parse(
    fs.readFileSync("execution/browser-runtime-lock.json"),
  );
  const prepared = JSON.parse(
    fs.readFileSync("evidence/ci/browser-runtime-image.json"),
  );
  if (
    prepared.status !== "QA_IMAGE_BUILT" ||
    prepared.dockerfileSha256 !== sha("Dockerfile.qa") ||
    prepared.lockSha256 !== sha("execution/browser-runtime-lock.json")
  )
    throw new Error("QA_IMAGE_PREPARATION_REQUIRED");
  const actual = await docker([
    "image",
    "inspect",
    lock.qaImageTag,
    "--format",
    "{{.Id}}",
  ]);
  if (actual.code || actual.stdout.trim() !== prepared.imageId)
    throw new Error("QA_IMAGE_ID_MISMATCH");
  if (
    testArgs.some(
      (arg) => typeof arg !== "string" || arg.startsWith("--config"),
    )
  )
    throw new Error("QA_CUSTOM_CONFIG_UNSUPPORTED");
  const id = randomUUID(),
    name = "firstscene-webkit-" + id.slice(0, 8),
    owner = createHash("sha256").update(root).digest("hex");
  const directory = path.join(root, "artifacts/private/linux-webkit", id);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const env = {
    CI: "true",
    FIRSTSCENE_LINUX_WEBKIT: "",
    FIRSTSCENE_QA_MODE: mode,
    FIRSTSCENE_QA_TEST_ARGS: JSON.stringify(testArgs),
    FIRSTSCENE_QA_SOURCE_COMMIT: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    FIRSTSCENE_BROWSER_REPORT: path.join(
      root,
      "evidence/linux-webkit-report.json",
    ),
    FIRSTSCENE_QA_IMAGE_ID: prepared.imageId,
    NEXT_TELEMETRY_DISABLED: "1",
    PLAYWRIGHT_BROWSERS_PATH: "/ms-playwright",
  };
  let receipt;
  if (mode !== "consumer") {
    receipt = ownedCiReceipt();
    const values = {
      ...privateEnvironment(receipt.adminEnvironment),
      ...privateEnvironment(receipt.runtimeEnvironment),
    };
    for (const key of ["DIRECT_DATABASE_URL", "DATABASE_URL"]) {
      const url = new URL(values[key]);
      url.hostname = "127.0.0.1";
      url.port = "5432";
      env[key] = url.toString();
    }
    env.RATE_LIMIT_HMAC_SECRET = values.RATE_LIMIT_HMAC_SECRET;
    env.FIRSTSCENE_CI_DISPOSABLE = "1";
  } else {
    const parent = path.dirname(consumerDirectory ?? "");
    if (
      !consumerDirectory ||
      !path.basename(parent).startsWith("firstscene-consumer-") ||
      fs.readFileSync(path.join(parent, ".firstscene-owned"), "utf8") !==
        "FirstScene disposable package consumer\n" ||
      fs.realpathSync(consumerDirectory) !== consumerDirectory
    )
      throw new Error("OWNED_CONSUMER_DIRECTORY_REQUIRED");
  }
  const secrets = [
    env.DATABASE_URL,
    env.DIRECT_DATABASE_URL,
    env.RATE_LIMIT_HMAC_SECRET,
    ...["DATABASE_URL", "DIRECT_DATABASE_URL"].map((k) =>
      env[k] ? decodeURIComponent(new URL(env[k]).password) : "",
    ),
  ].filter(Boolean);
  const redact = (value) => {
    for (const secret of secrets)
      value = value.replaceAll(secret, "<redacted>");
    return value.replace(
      /(?:firstscene_dev|__Host-firstscene)=[A-Za-z0-9_-]{43}/g,
      "<redacted-session-cookie>",
    );
  };
  const envFile = path.join(directory, "runtime.env");
  fs.writeFileSync(
    envFile,
    Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  let containerId = null;
  const run = {
    observedAt: new Date().toISOString(),
    mode,
    name,
    status: "IN_PROGRESS",
    sourceCommit: env.FIRSTSCENE_QA_SOURCE_COMMIT,
    imageId: prepared.imageId,
    rootSourceReadOnly: true,
    hostIpc: false,
    privileged: false,
    credentialsPrinted: false,
    commandExitCode: null,
  };
  const reportFile = path.join(directory, "run.json");
  const save = () =>
    fs.writeFileSync(reportFile, JSON.stringify(run, null, 2) + "\n");
  save();
  async function removeOwned() {
    if (containerId) {
      const checked = await docker([
        "inspect",
        containerId,
        "--format",
        "{{json .Config.Labels}}",
      ]);
      if (checked.code === 0) {
        const labels = JSON.parse(checked.stdout);
        if (
          labels["firstscene.qa.owner"] !== owner ||
          labels["firstscene.qa.run"] !== id
        )
          throw new Error("QA_CLEANUP_OWNERSHIP_CHANGED");
        const removed = await docker(["rm", "--force", containerId]);
        if (removed.code) throw new Error("QA_CONTAINER_CLEANUP_FAILED");
        run.containerRemoved = true;
        save();
      }
    }
  }
  try {
    const args = [
      "run",
      "--detach",
      "--init",
      "--name",
      name,
      "--label",
      "firstscene.qa.kind=webkit",
      "--label",
      `firstscene.qa.owner=${owner}`,
      "--label",
      `firstscene.qa.run=${id}`,
      "--workdir",
      root,
      "--env-file",
      envFile,
      "--mount",
      `type=bind,source=${root},target=${root},readonly`,
    ];
    for (const relative of [
      "evidence",
      "artifacts/private",
      "test-results",
      "apps/web/.next/cache",
    ])
      args.push("--tmpfs", path.join(root, relative) + ":rw");
    if (receipt) args.push("--network", "container:" + receipt.containerId);
    if (mode === "consumer")
      args.push(
        "--mount",
        `type=bind,source=${consumerDirectory},target=/firstscene-consumer,readonly`,
      );
    args.push(prepared.imageId, "node", "-e", "setInterval(()=>{},60000)");
    const started = await docker(args);
    if (started.code) throw new Error("QA_CONTAINER_START_FAILED");
    containerId = started.stdout.trim();
    run.containerId = containerId;
    save();
    const result = await docker([
      "exec",
      containerId,
      "node",
      "tools/linux-webkit-entry.mjs",
    ]);
    run.commandExitCode = result.code;
    fs.writeFileSync(
      path.join(directory, "commands.txt"),
      redact(result.stdout + result.stderr),
    );
    process.stdout.write(redact(result.stdout + result.stderr));
    const exported = await docker([
      "cp",
      `${containerId}:/qa-export`,
      path.join(directory, "export"),
    ]);
    if (exported.code) throw new Error("QA_EXPORT_FAILED");
    const exportedEvidence = path.join(directory, "export/evidence");
    function copy(source, target) {
      for (const e of fs.readdirSync(source, { withFileTypes: true })) {
        if (e.isSymbolicLink()) throw new Error("QA_OUTPUT_SYMLINK");
        const a = path.join(source, e.name),
          b = path.join(target, e.name);
        if (e.isDirectory()) {
          fs.mkdirSync(b, { recursive: true });
          copy(a, b);
        } else {
          const bytes = fs.readFileSync(a);
          if (secrets.some((v) => bytes.includes(Buffer.from(v))))
            throw new Error("QA_OUTPUT_CONTAINS_CREDENTIAL");
          fs.writeFileSync(
            b,
            /\.(?:json|txt|md)$/.test(b)
              ? redact(bytes.toString("utf8"))
              : bytes,
          );
        }
      }
    }
    copy(exportedEvidence, path.join(root, "evidence"));
    const raw = JSON.parse(
      fs.readFileSync(path.join(root, "evidence/linux-webkit-report.json")),
    );
    raw.firstsceneEnvironment = {
      ...(raw.firstsceneEnvironment ?? {}),
      runtime: "linux-container",
      imageId: prepared.imageId,
      sourceCommit: env.FIRSTSCENE_QA_SOURCE_COMMIT,
    };
    run.status = result.code ? "TESTS_FAILED" : "PASS";
    run.finishedAt = new Date().toISOString();
    save();
    return { exitCode: result.code, report: raw, record: reportFile };
  } catch (error) {
    run.status = "FAILED";
    run.finishedAt = new Date().toISOString();
    run.error = /^[A-Z_]+$/.test(error.message)
      ? error.message
      : "QA_RUN_FAILED";
    save();
    throw error;
  } finally {
    fs.rmSync(envFile, { force: true });
    await removeOwned();
  }
}
