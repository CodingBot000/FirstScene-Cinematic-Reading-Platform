import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { once } from "node:events";
import { parseEnv } from "node:util";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { root } from "./environment.mjs";
export const receiptFile = path.join(root, "artifacts/private/ci-service.json");
const workspaceHash = createHash("sha256").update(root).digest("hex");
const image =
  "postgres@sha256:0d938e975177bef9f1f61f3f9dbcf2e0aa0a139568f66d3415ed8892eb97f6ac";
export function requireDisposableCi() {
  if (process.env.CI !== "true" || process.env.FIRSTSCENE_CI_DISPOSABLE !== "1")
    throw new Error("EXPLICIT_DISPOSABLE_CI_REQUIRED");
}
export function privateEnvironment(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw new Error("CI_ENV_NOT_PRIVATE");
  return parseEnv(fs.readFileSync(file, "utf8"));
}
function docker(args) {
  const child = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  });
  if (child.status !== 0) throw new Error("CI_DOCKER_COMMAND_FAILED");
  return child.stdout.trim();
}
function inspected(name) {
  const child = spawnSync(
    "docker",
    [
      "inspect",
      "--format",
      "{{json .Id}} {{json .Config.Labels}} {{json .Created}}",
      name,
    ],
    { encoding: "utf8", timeout: 10000 },
  );
  if (child.status !== 0) return null;
  const match = child.stdout.trim().match(/^("[a-f0-9]+") (\{.*\}) ("[^"]+")$/);
  if (!match) throw new Error("CI_CONTAINER_INSPECTION_INVALID");
  return {
    id: JSON.parse(match[1]),
    labels: JSON.parse(match[2]),
    createdAt: JSON.parse(match[3]),
  };
}
export function ownedCiReceipt() {
  requireDisposableCi();
  if (!fs.existsSync(receiptFile))
    throw new Error("CI_SERVICE_OWNERSHIP_REQUIRED");
  const receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8"));
  const expectedDirectory = path.join(
    root,
    "artifacts/private/ci",
    receipt.marker ?? "invalid",
  );
  if (
    receipt.schemaVersion !== 1 ||
    receipt.workspaceHash !== workspaceHash ||
    !/^[a-f0-9-]{36}$/.test(receipt.marker) ||
    !/^firstscene-ci-[a-f0-9]{8}$/.test(receipt.containerName) ||
    receipt.directory !== expectedDirectory ||
    receipt.adminEnvironment !== path.join(expectedDirectory, "admin.env") ||
    receipt.runtimeEnvironment !==
      path.join(expectedDirectory, "runtime.env") ||
    !Number.isInteger(receipt.port) ||
    receipt.port < 1024 ||
    receipt.port > 65535 ||
    !Number.isInteger(receipt.appPort) ||
    receipt.appPort < 1024 ||
    receipt.appPort > 65535
  )
    throw new Error("CI_SERVICE_RECEIPT_INVALID");
  const actual = inspected(receipt.containerName);
  if (
    !actual ||
    actual.labels["dev.firstscene.workspace"] !== workspaceHash ||
    actual.labels["dev.firstscene.ci-marker"] !== receipt.marker ||
    (receipt.containerId && actual.id !== receipt.containerId) ||
    (receipt.createdAt && actual.createdAt !== receipt.createdAt)
  )
    throw new Error("CI_SERVICE_OWNERSHIP_MISMATCH");
  return { ...receipt, containerId: actual.id, createdAt: actual.createdAt };
}
function save(receipt) {
  fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + "\n", {
    mode: 0o600,
  });
}
async function freePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
export function exportGithub(values, masks = []) {
  if (process.env.GITHUB_ACTIONS !== "true" || !process.env.GITHUB_ENV) return;
  // GitHub consumes these protocol commands as masks; local runs never emit secret-bearing protocol data.
  for (const value of masks)
    process.stdout.write("::add-mask::" + value + "\n");
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Z_]+$/.test(key) || /[\r\n]/.test(value))
      throw new Error("CI_ENV_EXPORT_INVALID");
    fs.appendFileSync(process.env.GITHUB_ENV, `${key}=${value}\n`);
  }
}
export async function startCiService() {
  requireDisposableCi();
  if (fs.existsSync(receiptFile)) {
    const receipt = ownedCiReceipt();
    if (receipt.status !== "RUNNING")
      throw new Error("CI_PREVIOUS_START_INCOMPLETE");
    const values = privateEnvironment(receipt.adminEnvironment);
    const { createPool } =
      await import("../../packages/server-data/dist/index.js");
    const pool = createPool(values.DIRECT_DATABASE_URL, 1);
    try {
      const marker = (
        await pool.query(
          "SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
        )
      ).rows[0]?.marker;
      if (marker !== "FirstScene disposable CI " + receipt.marker)
        throw new Error("CI_DATABASE_MARKER_MISMATCH");
    } finally {
      await pool.end();
    }
    exportGithub(values, [values.DIRECT_DATABASE_URL]);
    return { ...receipt, reused: true };
  }
  fs.mkdirSync(path.dirname(receiptFile), { recursive: true });
  if (fs.realpathSync(path.dirname(receiptFile)) !== path.dirname(receiptFile))
    throw new Error("CI_PRIVATE_DIRECTORY_SCOPE_INVALID");
  const marker = randomUUID(),
    name = "firstscene-ci-" + marker.slice(0, 8);
  const directory = path.join(root, "artifacts/private/ci", marker);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const password = randomBytes(32).toString("hex"),
    port = await freePort();
  let appPort = await freePort();
  for (let attempt = 0; appPort === port && attempt < 2; attempt++)
    appPort = await freePort();
  if (appPort === port) throw new Error("CI_DISTINCT_LOOPBACK_PORTS_REQUIRED");
  const pgEnvironment = path.join(directory, "postgres.env"),
    adminEnvironment = path.join(directory, "admin.env");
  fs.writeFileSync(
    pgEnvironment,
    `POSTGRES_USER=firstscene_ci_owner\nPOSTGRES_DB=firstscene_ci\nPOSTGRES_PASSWORD=${password}\n`,
    { flag: "wx", mode: 0o600 },
  );
  const direct = `postgresql://firstscene_ci_owner:${password}@127.0.0.1:${port}/firstscene_ci`;
  const values = {
    DIRECT_DATABASE_URL: direct,
    FIRSTSCENE_CI_DATABASE_MARKER: marker,
    FIRSTSCENE_CI_DISPOSABLE: "1",
  };
  fs.writeFileSync(
    adminEnvironment,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
    { flag: "wx", mode: 0o600 },
  );
  let receipt = {
    schemaVersion: 1,
    workspaceHash,
    marker,
    containerName: name,
    port,
    appPort,
    image,
    directory,
    adminEnvironment,
    runtimeEnvironment: path.join(directory, "runtime.env"),
    status: "STARTING",
  };
  save(receipt); // Persist intent before creation; an ambiguous result never creates another container automatically.
  try {
    docker([
      "run",
      "--detach",
      "--name",
      name,
      "--label",
      "dev.firstscene.workspace=" + workspaceHash,
      "--label",
      "dev.firstscene.ci-marker=" + marker,
      "--env-file",
      pgEnvironment,
      "--publish",
      `127.0.0.1:${port}:5432`,
      "--publish",
      `127.0.0.1:${appPort}:3000`,
      image,
    ]);
    receipt = ownedCiReceipt();
    save(receipt);
    const { createPool } =
      await import("../../packages/server-data/dist/index.js");
    const pool = createPool(direct, 1);
    try {
      const deadline = Date.now() + 60000;
      let ready = false;
      while (Date.now() < deadline) {
        try {
          await pool.query("SELECT 1");
          ready = true;
          break;
        } catch {
          await pause(250);
        }
      }
      if (!ready) throw new Error("CI_POSTGRES_NOT_READY");
      await pool.query(
        `COMMENT ON DATABASE firstscene_ci IS 'FirstScene disposable CI ${marker}'`,
      );
    } finally {
      await pool.end();
    }
    receipt.status = "RUNNING";
    save(receipt);
    exportGithub(values, [password, direct]);
    return receipt;
  } catch (error) {
    receipt.status = "FAILED_START";
    save(receipt);
    throw error;
  }
}
export function stopCiService() {
  requireDisposableCi();
  if (!fs.existsSync(receiptFile)) return { removed: false };
  const receipt = ownedCiReceipt();
  docker(["rm", "--force", "--volumes", receipt.containerId]);
  // Only the receipt's freshly created ephemeral container/anonymous volume and private files are removed.
  fs.rmSync(receipt.directory, { recursive: true, force: true });
  fs.unlinkSync(receiptFile);
  return { removed: true, containerName: receipt.containerName };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const action = process.argv[2];
    if (action === "up") {
      const receipt = await startCiService();
      console.log(
        JSON.stringify({
          status: "CI_POSTGRES_RUNNING",
          host: "127.0.0.1",
          port: receipt.port,
          database: "firstscene_ci",
          receipt: "artifacts/private/ci-service.json",
          secretsPrinted: false,
        }),
      );
    } else if (action === "down")
      console.log(
        JSON.stringify({
          status: "CI_POSTGRES_STOPPED",
          ...stopCiService(),
          secretsPrinted: false,
        }),
      );
    else throw new Error("CI_SERVICE_ACTION_REQUIRED");
  } catch (error) {
    console.error(
      JSON.stringify({
        status: "CI_SERVICE_FAILED",
        code: /^[A-Z_0-9]+$/.test(error.message)
          ? error.message
          : "CI_SERVICE_UNAVAILABLE",
        secretsPrinted: false,
      }),
    );
    process.exitCode = 1;
  }
}
