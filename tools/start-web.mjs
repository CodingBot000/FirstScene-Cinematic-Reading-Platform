import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { prepareStandalone, workspace } from "./prepare-standalone.mjs";
import { validateRuntimeEnvironment } from "../packages/server-data/dist/environment.js";
const args = process.argv.slice(2);
const index = args.indexOf("--port");
const port = Number(index >= 0 ? args[index + 1] : (process.env.PORT ?? 3100));
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("LOCAL_PORT_INVALID");
const preparedApp = path.join(workspace, "apps/web/.next/standalone/apps/web");
const { server, app } = args.includes("--prepared")
  ? { server: path.join(preparedApp, "server.js"), app: preparedApp }
  : prepareStandalone();
if (!fs.existsSync(server)) throw new Error("STANDALONE_BUILD_REQUIRED");
const file = path.join(workspace, "apps/web/.env.local");
const local =
  !process.env.DATABASE_URL &&
  process.env.DEPLOY_TARGET !== "public" &&
  fs.existsSync(file)
    ? parseEnv(fs.readFileSync(file, "utf8"))
    : {};
const env = {
  ...local,
  ...process.env,
  PORT: String(port),
  HOSTNAME: "127.0.0.1",
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
};
delete env.DIRECT_DATABASE_URL;
delete env.LOCAL_POSTGRES_PASSWORD;
const requestLog =
  env.DEPLOY_TARGET === "local" && env.FIRSTSCENE_TEST_KIND === "browser"
    ? env.FIRSTSCENE_TEST_REQUEST_LOG
    : undefined;
delete env.FIRSTSCENE_TEST_REQUEST_LOG;
try {
  validateRuntimeEnvironment(env);
} catch (error) {
  console.error(
    JSON.stringify({
      status: "STARTUP_CONFIGURATION_INVALID",
      code: /^[A-Z_0-9]+$/.test(error.message)
        ? error.message
        : "CONFIGURATION_INVALID",
      secretsPrinted: false,
    }),
  );
  process.exit(1);
}
const child = spawn(process.execPath, [server], {
  cwd: app,
  env,
  stdio: requestLog ? ["inherit", "pipe", "inherit"] : "inherit",
});
if (requestLog) {
  child.stdout.pipe(process.stdout, { end: false });
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (!line.startsWith("{")) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    const outcome = event?.transaction?.outcome;
    if (
      event?.route === "/api/v1/preferences" &&
      event.status === 200 &&
      typeof event.requestId === "string" &&
      /^[a-f0-9-]{36}$/.test(event.requestId) &&
      (outcome === "committed" || outcome === "replayed")
    )
      fs.appendFileSync(
        requestLog,
        JSON.stringify({ requestId: event.requestId, outcome }) + "\n",
        { mode: 0o600 },
      );
  });
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => child.kill(signal));
child.on("error", () => {
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
