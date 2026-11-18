import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { isolatedDatabase } from "../database/isolated.mjs";

export async function withProductionServer(action, { prepared = false } = {}) {
  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const db = await isolatedDatabase();
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    DATABASE_URL: db.runtimeUrl,
    APP_ORIGIN: origin,
    DEPLOY_TARGET: "local",
    RATE_LIMIT_HMAC_SECRET: randomBytes(32).toString("hex"),
  };
  delete env.DIRECT_DATABASE_URL;
  delete env.LOCAL_POSTGRES_PASSWORD;
  const child = spawn(
    process.execPath,
    [
      "tools/start-web.mjs",
      "--port",
      String(port),
      ...(prepared ? ["--prepared"] : []),
    ],
    {
      env,
      stdio: ["ignore", "ignore", "ignore"],
    },
  );
  let failed = false;
  child.on("error", () => {
    failed = true;
  });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  try {
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      if (failed || child.exitCode !== null)
        throw new Error("PERF_SERVER_EXITED");
      try {
        ready = (
          await fetch(origin + "/health/ready", {
            signal: globalThis.AbortSignal.timeout(1000),
          })
        ).ok;
      } catch {
        /* Wait only for this owned server, never reuse an unrelated process. */
      }
      if (ready) break;
      await pause(100);
    }
    if (!ready) throw new Error("PERF_SERVER_NOT_READY");
    return await action({ origin, database: db.name });
  } finally {
    try {
      if (child.exitCode === null && !failed) {
        child.kill("SIGTERM");
        await Promise.race([
          exited,
          pause(5000).then(() => {
            throw new Error("PERF_SERVER_STOP_TIMEOUT");
          }),
        ]);
      }
    } finally {
      await db.cleanup();
    }
  }
}
