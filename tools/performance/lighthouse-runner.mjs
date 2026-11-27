import net from "node:net";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

export async function runAudit(command, env) {
  // Use the same pinned browser and launch policy as the Playwright suites.
  // A fresh profile per audit preserves the cold navigation measurement.
  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const { port } = reservation.address();
  await new Promise((resolve) => reservation.close(resolve));
  const browser = await chromium.launch({
    channel: "chromium",
    env,
    args: [
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${port}`,
    ],
  });
  try {
    const endpoint = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: globalThis.AbortSignal.timeout(3000),
    });
    const info = await endpoint.json();
    if (
      !endpoint.ok ||
      !info.webSocketDebuggerUrl?.startsWith(
        `ws://127.0.0.1:${port}/devtools/browser/`,
      )
    )
      throw new Error("LIGHTHOUSE_CDP_NOT_LOOPBACK");
    return await new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [...command, `--port=${port}`, "--hostname=127.0.0.1"],
        {
          env,
          stdio: "ignore",
          timeout: 120000,
        },
      );
      child.on("error", () => resolve(1));
      child.on("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    await browser.close();
  }
}
