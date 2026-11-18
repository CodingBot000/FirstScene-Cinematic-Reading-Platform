import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { webkit } from "@playwright/test";
import { withProductionServer } from "./performance/server.mjs";
const root = process.cwd(),
  mode = process.env.FIRSTSCENE_QA_MODE;
async function run(args, env = process.env) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, args, { env, stdio: "inherit" });
    c.on("error", () => resolve(1));
    c.on("exit", (code) => resolve(code ?? 1));
  });
}
const expected = JSON.parse(
  fs.readFileSync("execution/browser-runtime-lock.json"),
).playwrightVersion;
const installed = JSON.parse(
  fs.readFileSync("node_modules/@playwright/test/package.json"),
).version;
if (installed !== expected) throw new Error("QA_PLAYWRIGHT_VERSION_MISMATCH");
let exitCode = 1;
try {
  const b = await webkit.launch();
  let pointer;
  try {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p.setContent(
      '<button style="position:absolute;left:20px;top:20px;width:100px;height:44px">Input check</button>',
    );
    await p.evaluate(() =>
      document.addEventListener(
        "click",
        (event) => {
          globalThis.firstscenePointer = {
            x: event.clientX,
            y: event.clientY,
            target: event.target.tagName,
          };
        },
        { once: true },
      ),
    );
    await p.getByRole("button", { name: "Input check" }).click();
    pointer = await p.evaluate(() => globalThis.firstscenePointer);
    if (
      !pointer ||
      pointer.target !== "BUTTON" ||
      Math.abs(pointer.x - 70) > 1 ||
      Math.abs(pointer.y - 42) > 1
    )
      throw new Error("LINUX_POINTER_COORDINATES_INVALID");
    fs.mkdirSync("evidence/ci", { recursive: true });
    fs.writeFileSync(
      "evidence/ci/linux-webkit-input.json",
      JSON.stringify(
        {
          observedAt: new Date().toISOString(),
          status: "PASS",
          platform: process.platform,
          arch: process.arch,
          node: process.version,
          browserVersion: b.version(),
          pointer,
          productionApplicationProof: false,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await b.close();
  }
  if (mode === "functional")
    exitCode = await run([
      "tools/run-browser-tests.mjs",
      "--project=webkit",
      "--config=tools/linux-e2e-playwright.config.ts",
      ...JSON.parse(process.env.FIRSTSCENE_QA_TEST_ARGS ?? "[]"),
    ]);
  else if (mode === "consumer") {
    process.env.FIRSTSCENE_CONSUMER_URL = "http://127.0.0.1:6007";
    exitCode = await run([
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config=tools/linux-consumer-playwright.config.ts",
    ]);
  } else if (["visual", "performance"].includes(mode))
    await withProductionServer(
      async ({ origin, database }) => {
        const env = {
          ...process.env,
          [mode === "visual"
            ? "FIRSTSCENE_VISUAL_ORIGIN"
            : "FIRSTSCENE_PERF_ORIGIN"]: origin,
        };
        exitCode = await run(
          [
            "node_modules/@playwright/test/cli.js",
            "test",
            `--config=tools/linux-${mode}-playwright.config.ts`,
          ],
          env,
        );
        if (fs.existsSync(process.env.FIRSTSCENE_BROWSER_REPORT)) {
          const r = JSON.parse(
            fs.readFileSync(process.env.FIRSTSCENE_BROWSER_REPORT),
          );
          r.firstsceneEnvironment = {
            origin,
            database,
            realDatabase: true,
            platform: process.platform,
            arch: process.arch,
          };
          fs.writeFileSync(
            process.env.FIRSTSCENE_BROWSER_REPORT,
            JSON.stringify(r, null, 2) + "\n",
          );
        }
      },
      { prepared: true },
    );
  else throw new Error("QA_MODE_INVALID");
} catch (error) {
  console.error(error.message);
  exitCode = 1;
} finally {
  fs.mkdirSync("/qa-export", { recursive: true });
  for (const relative of ["evidence", "artifacts/private", "test-results"]) {
    const source = path.join(root, relative),
      target = path.join("/qa-export", relative);
    if (fs.existsSync(source)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(source, target, { recursive: true });
    }
  }
}
process.exitCode = exitCode;
