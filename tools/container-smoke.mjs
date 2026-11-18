import fs from "node:fs";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";
import { createPool } from "../packages/server-data/dist/index.js";
import { ownedCiReceipt, privateEnvironment } from "./database/ci-service.mjs";
const receipt = ownedCiReceipt();
const admin = privateEnvironment(receipt.adminEnvironment),
  runtime = privateEnvironment(receipt.runtimeEnvironment);
const secrets = [
  admin.DIRECT_DATABASE_URL,
  new URL(admin.DIRECT_DATABASE_URL).password,
  runtime.DATABASE_URL,
  new URL(runtime.DATABASE_URL).password,
  runtime.RATE_LIMIT_HMAC_SECRET,
];
const report = {
  status: "IN_PROGRESS",
  observedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  scope:
    "Owned local Docker deployment with real disposable PostgreSQL; no public release/rollback claim",
  checks: [],
  releaseReady: false,
};
fs.mkdirSync("evidence/container", { recursive: true });
function write() {
  fs.writeFileSync(
    "evidence/container/smoke.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
function check(name, condition) {
  report.checks.push({ name, passed: Boolean(condition) });
  write();
  if (!condition) throw new Error("CONTAINER_CHECK_FAILED");
}
function docker(args, allowed = [0]) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  });
  const output = result.stdout + result.stderr;
  if (secrets.some((secret) => output.includes(secret)))
    throw new Error("CONTAINER_SECRET_LOG_DETECTED");
  if (!allowed.includes(result.status))
    throw new Error("CONTAINER_COMMAND_FAILED");
  return {
    code: result.status,
    output: result.stdout.trim(),
    combined: output,
  };
}
const marker = randomUUID(),
  name = "firstscene-app-smoke-" + marker.slice(0, 8);
let id, browser, owner;
function removeOwnedApplication() {
  const actual = spawnSync(
    "docker",
    [
      "inspect",
      "--format",
      '{{json .Id}} {{json (index .Config.Labels "dev.firstscene.smoke")}}',
      name,
    ],
    { encoding: "utf8", timeout: 10000 },
  );
  if (actual.status !== 0) return false;
  const match = actual.stdout.trim().match(/^("[^"]+") ("[^"]+")$/);
  if (
    !match ||
    JSON.parse(match[2]) !== marker ||
    (id && JSON.parse(match[1]) !== id)
  )
    throw new Error("CONTAINER_CLEANUP_OWNERSHIP_MISMATCH");
  docker(["rm", "--force", JSON.parse(match[1])]);
  return true;
}
async function ready(origin) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      if (
        (
          await fetch(origin + "/health/ready", {
            signal: globalThis.AbortSignal.timeout(1000),
          })
        ).ok
      )
        return;
    } catch {
      /* Only this owned app is polled. */
    }
    await pause(100);
  }
  throw new Error("CONTAINER_APP_NOT_READY");
}
write();
try {
  const imageName =
    process.env.FIRSTSCENE_CONTAINER_IMAGE ?? "firstscene:local-validated";
  const inspected = docker([
    "image",
    "inspect",
    "--format",
    "{{json .Id}} {{json .Config.User}}",
    imageName,
  ]).output.match(/^("sha256:[a-f0-9]+") ("[^"]+")$/);
  if (!inspected) throw new Error("CONTAINER_IMAGE_INSPECTION_FAILED");
  const imageId = JSON.parse(inspected[1]);
  report.imageId = imageId;
  check(
    "runtime image uses the unprivileged node user",
    JSON.parse(inspected[2]) === "node",
  );
  const inspection = JSON.parse(
    docker([
      "run",
      "--rm",
      "--entrypoint",
      "node",
      imageId,
      "-e",
      "const fs=require('node:fs');const names=fs.readdirSync('/app',{recursive:true});console.log(JSON.stringify({node:process.version,uid:process.getuid(),envFiles:names.filter(p=>p.split('/').at(-1).startsWith('.env')),privateBriefing:fs.existsSync('/app/references/private'),gitHistory:fs.existsSync('/app/.git')}));",
    ]).output,
  );
  report.runtime = inspection;
  check(
    "no environment files, private source material or Git history are baked into runtime",
    inspection.uid !== 0 &&
      inspection.envFiles.length === 0 &&
      !inspection.privateBriefing &&
      !inspection.gitHistory,
  );
  const missing = docker(["run", "--rm", imageId], [1]);
  check(
    "missing configuration exits before serving",
    missing.code === 1 && missing.combined.includes("APP_ORIGIN_INVALID"),
  );
  const bad = path.join(receipt.directory, "public-origin-negative.env");
  fs.writeFileSync(
    bad,
    "APP_ORIGIN=http://reader.example\nDEPLOY_TARGET=public\n",
    { mode: 0o600 },
  );
  const unsafe = docker(["run", "--rm", "--env-file", bad, imageId], [1]);
  check(
    "public HTTP configuration fails closed",
    unsafe.code === 1 && unsafe.combined.includes("PUBLIC_HTTPS_REQUIRED"),
  );
  const database = new URL(runtime.DATABASE_URL);
  database.port = "5432";
  const origin = `http://127.0.0.1:${receipt.appPort}`,
    environment = path.join(receipt.directory, "container-app.env");
  fs.writeFileSync(
    environment,
    `APP_ORIGIN=${origin}\nDEPLOY_TARGET=local\nDATABASE_URL=${database}\nRATE_LIMIT_HMAC_SECRET=${runtime.RATE_LIMIT_HMAC_SECRET}\n`,
    { mode: 0o600 },
  );
  id = docker([
    "run",
    "--detach",
    "--init",
    "--name",
    name,
    "--label",
    "dev.firstscene.smoke=" + marker,
    "--network",
    "container:" + receipt.containerId,
    "--env-file",
    environment,
    imageId,
  ]).output;
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("CONTAINER_ID_INVALID");
  report.origin = origin;
  write();
  await ready(origin);
  check(
    "liveness and real database readiness return200",
    (await fetch(origin + "/health/live")).status === 200,
  );
  const boundaries = JSON.parse(
    docker([
      "exec",
      id,
      "node",
      "-e",
      "console.log(JSON.stringify({uid:process.getuid(),owner:!!process.env.DIRECT_DATABASE_URL||!!process.env.LOCAL_POSTGRES_PASSWORD,testBypass:Object.keys(process.env).some(k=>/^FIRSTSCENE_TEST_/.test(k))}));",
    ]).output,
  );
  check(
    "application receives runtime credentials without owner/test bypass",
    boundaries.uid !== 0 && !boundaries.owner && !boundaries.testBypass,
  );
  owner = createPool(admin.DIRECT_DATABASE_URL, 1);
  const before = Number(
    (await owner.query("SELECT count(*) FROM firstscene.sessions")).rows[0]
      .count,
  );
  browser = await chromium.launch();
  const a = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  const b = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  const pageA = await a.newPage(),
    pageB = await b.newPage();
  await pageA.goto("/read/post-office#mail-s01-b01");
  await expect(pageA.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  await expect(pageA.locator(".fs-reader-main p.fs-type-reading")).toHaveCount(
    36,
  );
  await pageA.getByRole("button", { name: "설정", exact: true }).click();
  await pageA.getByRole("radio", { name: "24px", exact: true }).check();
  await pageA.keyboard.press("Escape");
  await expect(pageA.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  const meA = await (await pageA.request.get("/api/v1/me")).json();
  check(
    "browserA writes preferences through API to PostgreSQL",
    meA.preferences.fontSize === 24,
  );
  await pageB.goto("/library");
  await expect(
    pageB.getByText("아직 남긴 독서 기록이 없어요.", { exact: true }),
  ).toBeVisible();
  check(
    "fresh browserB cannot read browserA records",
    (await pageB.request.get("/api/v1/me")).status() === 401,
  );
  await pageB.goto("/settings");
  await pageB.getByRole("radio", { name: "18px", exact: true }).check();
  await expect(pageB.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  const meB = await (await pageB.request.get("/api/v1/me")).json();
  check(
    "browserB has a distinct real anonymous session",
    meB.preferences.fontSize === 18 &&
      meB.session.epoch !== meA.session.epoch &&
      meB.progress.length === 0,
  );
  const after = Number(
    (await owner.query("SELECT count(*) FROM firstscene.sessions")).rows[0]
      .count,
  );
  check(
    "exactly two new session rows exist in the real database",
    after === before + 2,
  );
  const authenticationCookies = (await a.cookies()).filter(
    (cookie) => cookie.name === "firstscene_dev",
  );
  check(
    "authentication cookie stays HttpOnly",
    authenticationCookies.length === 1 &&
      authenticationCookies.every((cookie) => cookie.httpOnly) &&
      !(await pageA.evaluate(() => document.cookie)).includes("firstscene_dev"),
  );
  await pageA.screenshot({
    path: "evidence/container/reader-390.png",
    fullPage: false,
  });
  docker(["restart", "--time", "10", id]);
  await ready(origin);
  await pageA.reload();
  await expect(pageA.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  const restored = await (await pageA.request.get("/api/v1/me")).json();
  check(
    "process restart preserves actual session expiry and saved preferences",
    restored.preferences.fontSize === 24 &&
      restored.session.epoch === meA.session.epoch &&
      restored.session.expiresAt === meA.session.expiresAt,
  );
  check(
    "browserB state survives independently",
    (await (await pageB.request.get("/api/v1/me")).json()).preferences
      .fontSize === 18,
  );
  report.status = "PASS";
} catch (error) {
  report.status = "FAILED";
  report.error = /^[A-Z_0-9]+$/.test(error.message)
    ? error.message
    : "CONTAINER_SMOKE_FAILED";
  process.exitCode = 1;
} finally {
  const closed = await Promise.allSettled([browser?.close(), owner?.end()]);
  if (closed.some((result) => result.status === "rejected")) {
    report.status = "FAILED";
    report.cleanup = "BROWSER_OR_POOL_CLOSE_FAILED";
    process.exitCode = 1;
  }
  try {
    report.ownedApplicationRemoved = removeOwnedApplication();
  } catch {
    report.status = "FAILED";
    report.cleanup = "OWNERSHIP_OR_REMOVAL_FAILED";
    process.exitCode = 1;
  }
  report.finishedAt = new Date().toISOString();
  write();
  console.log(
    JSON.stringify({
      status: report.status,
      checks: report.checks.length,
      report: "evidence/container/smoke.json",
      publicRelease: false,
    }),
  );
}
