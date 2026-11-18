import {
  useLinuxWebkit,
  runLinuxWebkit,
  mergeBrowserReports,
} from "../browser-runtime.mjs";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { withProductionServer } from "./server.mjs";
fs.mkdirSync("evidence/performance/current", { recursive: true });
for (const name of [
  "browser-results",
  "interactions",
  "resources",
  "lifecycle-perf-chromium",
  "lifecycle-perf-webkit",
]) {
  const file = `evidence/performance/current/${name}.json`;
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
try {
  await withProductionServer(async ({ origin }) => {
    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      LANG: "ko_KR.UTF-8",
      CI: process.env.CI,
      FIRSTSCENE_PERF_ORIGIN: origin,
    };
    let code = await new Promise((resolve) => {
      const child = spawn(
        "pnpm",
        [
          "exec",
          "playwright",
          "test",
          "--config=tools/performance-playwright.config.ts",
          ...(useLinuxWebkit() ? ["--project=perf-chromium"] : []),
          ...process.argv.slice(2),
        ],
        { env, stdio: "inherit" },
      );
      child.on("error", () => resolve(1));
      child.on("exit", (code) => resolve(code ?? 1));
    });
    if (useLinuxWebkit()) {
      const file = "evidence/performance/current/browser-results.json";
      const host = JSON.parse(fs.readFileSync(file));
      const linux = await runLinuxWebkit("performance");
      fs.writeFileSync(
        file,
        JSON.stringify(mergeBrowserReports([host, linux.report]), null, 2) +
          "\n",
      );
      code = code || linux.exitCode;
    }
    process.exitCode = code;
  });
} catch {
  console.error("PERFORMANCE_BROWSER_COLLECTION_FAILED");
  process.exitCode = 1;
}
