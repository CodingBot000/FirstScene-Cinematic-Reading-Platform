import { parseEnv } from "node:util";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { randomBytes } from "node:crypto";
export const root = path.resolve(import.meta.dirname, "../..");
export function loadLocalEnvironment() {
  if (
    process.env.CI === "true" &&
    process.env.FIRSTSCENE_CI_DISPOSABLE === "1"
  ) {
    if (!process.env.DIRECT_DATABASE_URL || !process.env.DATABASE_URL)
      throw new Error("CI_DATABASE_ENVIRONMENT_REQUIRED");
    return;
  }
  const file = path.join(root, ".env.local");
  if (fs.existsSync(file)) process.loadEnvFile(file);
}
export async function bootstrapLocalEnvironment() {
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) {
    let selected = 0;
    for (let port = 55432; port <= 55439; port++) {
      const free = await new Promise((resolve) => {
        const server = net.createServer();
        server.once("error", () => resolve(false));
        server.listen(port, "127.0.0.1", () =>
          server.close(() => resolve(true)),
        );
      });
      if (free) {
        selected = port;
        break;
      }
    }
    if (!selected) throw new Error("NO_OWNED_LOOPBACK_PORT_AVAILABLE");
    const owner = randomBytes(32).toString("hex"),
      runtime = randomBytes(32).toString("hex");
    const text = `APP_ORIGIN=http://127.0.0.1:3100\nDEPLOY_TARGET=local\nLOCAL_POSTGRES_PASSWORD=${owner}\nLOCAL_POSTGRES_PORT=${selected}\nDIRECT_DATABASE_URL=postgresql://firstscene_owner:${owner}@127.0.0.1:${selected}/firstscene_dev\nDATABASE_URL=postgresql://firstscene_runtime:${runtime}@127.0.0.1:${selected}/firstscene_dev\nRATE_LIMIT_HMAC_SECRET=${randomBytes(32).toString("hex")}\n`;
    fs.writeFileSync(file, text, { flag: "wx", mode: 0o600 });
  }
  loadLocalEnvironment();
  const appFile = path.join(root, "apps/web/.env.local");
  const ownsLink =
    fs.existsSync(appFile) &&
    fs.lstatSync(appFile).isSymbolicLink() &&
    fs.readlinkSync(appFile) === "../../.env.local";
  if (ownsLink) fs.unlinkSync(appFile);
  if (!fs.existsSync(appFile)) {
    const local = parseEnv(fs.readFileSync(file, "utf8"));
    const text =
      ["APP_ORIGIN", "DEPLOY_TARGET", "DATABASE_URL", "RATE_LIMIT_HMAC_SECRET"]
        .map((key) => `${key}=${local[key] ?? ""}`)
        .join("\n") + "\n";
    fs.writeFileSync(appFile, text, { flag: "wx", mode: 0o600 });
  }
  const port = Number(process.env.LOCAL_POSTGRES_PORT);
  if (!Number.isInteger(port) || port < 55432 || port > 55439)
    throw new Error("LOCAL_PORT_NOT_IN_APPROVED_RANGE");
  return { port, envPath: file };
}
