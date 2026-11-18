import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
const origin = process.env.FIRSTSCENE_PERF_ORIGIN;
if (!origin || new URL(origin).hostname !== "127.0.0.1")
  throw new Error("OWNED_PERFORMANCE_ORIGIN_REQUIRED");
export default defineConfig({
  testDir: "../tests/performance",
  outputDir: "../artifacts/private/performance-test-results",
  workers: 1,
  retries: 0,
  timeout: 120000,
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: "../evidence/performance/current/browser-results.json" },
    ],
  ],
  use: {
    actionTimeout: 10000,
    baseURL: origin,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "perf-chromium", use: { browserName: "chromium" } },
    {
      name: "perf-webkit",
      testMatch: /lifecycle.spec.ts/,
      use: { browserName: "webkit", viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    command:
      "python3 -m http.server 6006 --bind 127.0.0.1 --directory apps/ui-lab/dist",
    url: "http://127.0.0.1:6006/iframe.html",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
