import fs from "node:fs";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
import { prepareStandalone } from "./prepare-standalone.mjs";
import { ownedCiReceipt, privateEnvironment } from "./database/ci-service.mjs";
const receipt = ownedCiReceipt(),
  values = privateEnvironment(receipt.runtimeEnvironment);
const artifact = prepareStandalone();
const base = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR,
  LANG: "ko_KR.UTF-8",
  ...values,
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  HOSTNAME: "127.0.0.1",
};
const known = [
  values.DATABASE_URL,
  new URL(values.DATABASE_URL).password,
  values.RATE_LIMIT_HMAC_SECRET,
];
const result = {
  status: "IN_PROGRESS",
  observedAt: new Date().toISOString(),
  checks: [],
  releaseReady: false,
};
function check(name, condition) {
  result.checks.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error("STARTUP_CHECK_FAILED");
}
let child, exited;
async function freePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
try {
  for (const [name, overrides, expected] of [
    [
      "public HTTP",
      { APP_ORIGIN: "http://reader.example", DEPLOY_TARGET: "public" },
      "PUBLIC_HTTPS_REQUIRED",
    ],
    [
      "owner credentials",
      { DIRECT_DATABASE_URL: "fixture-only-no-live-authority" },
      "OWNER_CREDENTIALS_FORBIDDEN_AT_RUNTIME",
    ],
    [
      "client-exposed secret",
      { NEXT_PUBLIC_RATE_LIMIT_HMAC_SECRET: "fixture-only" },
      "PUBLIC_SECRET_FORBIDDEN",
    ],
    [
      "missing rate secret",
      { RATE_LIMIT_HMAC_SECRET: "" },
      "RATE_SECRET_REQUIRED",
    ],
  ]) {
    // Bypass the tool wrapper intentionally: this exercises Next's actual startup instrumentation.
    const rejected = spawnSync(process.execPath, [artifact.server], {
      cwd: artifact.app,
      env: { ...base, PORT: String(await freePort()), ...overrides },
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    const output = rejected.stdout + rejected.stderr;
    check(
      name + " error logs redact known credentials",
      known.every((secret) => !output.includes(secret)),
    );
    check(
      "actual Next startup rejects " + name,
      rejected.status === 1 && output.includes(expected),
    );
  }
  const reserved = net.createServer();
  reserved.listen(0, "127.0.0.1");
  await once(reserved, "listening");
  const port = reserved.address().port;
  await new Promise((resolve) => reserved.close(resolve));
  const origin = `http://127.0.0.1:${port}`,
    unavailable = new URL(values.DATABASE_URL);
  unavailable.port = "1";
  child = spawn(process.execPath, [artifact.server], {
    cwd: artifact.app,
    env: {
      ...base,
      PORT: String(port),
      APP_ORIGIN: origin,
      DATABASE_URL: unavailable.toString(),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let leaked = false;
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data) => {
      const text = String(data);
      if (known.some((secret) => text.includes(secret))) leaked = true;
    });
  exited = new Promise((resolve) => child.once("exit", resolve));
  const deadline = Date.now() + 30000;
  let alive = false;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      alive = (
        await fetch(origin + "/health/live", {
          signal: globalThis.AbortSignal.timeout(1000),
        })
      ).ok;
    } catch {
      /* Startup, not a database retry loop. */
    }
    if (alive) break;
    await pause(100);
  }
  check(
    "syntactically valid configuration starts while DB is unavailable",
    alive,
  );
  check(
    "cold unavailable DB produces readiness503",
    (await fetch(origin + "/health/ready")).status === 503,
  );
  const story = await fetch(origin + "/read/post-office");
  const html = await story.text();
  check(
    "cold unavailable DB preserves complete public manuscript SSR",
    story.status === 200 &&
      html.includes("바다가 보이는 언덕의 우체국") &&
      (html.match(/data-beat="mail-/g) ?? []).length === 36,
  );
  check("startup/outage logs contain no known credential", !leaked);
  result.status = "PASS";
} catch (error) {
  result.status = "FAILED";
  result.error = /^[A-Z_0-9]+$/.test(error.message)
    ? error.message
    : "STARTUP_SMOKE_UNAVAILABLE";
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([exited, pause(5000)]);
  }
  fs.mkdirSync("evidence/container", { recursive: true });
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(
    "evidence/container/startup.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      status: result.status,
      checks: result.checks.length,
      report: "evidence/container/startup.json",
      releaseReady: false,
    }),
  );
}
