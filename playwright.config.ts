import { defineConfig } from "@playwright/test";
const origin = process.env.FIRSTSCENE_TEST_ORIGIN ?? "http://127.0.0.1:3110";
const port = new URL(origin).port;
const api = process.env.FIRSTSCENE_TEST_KIND === "api";
const app = {
  command: `node tools/start-web.mjs --port ${port}`,
  url: origin,
  reuseExistingServer: false,
  timeout: 30000,
  env: { DIRECT_DATABASE_URL: "", LOCAL_POSTGRES_PASSWORD: "" },
};
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  retries: 0,
  workers: api ? 1 : 2,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          process.env.FIRSTSCENE_BROWSER_REPORT ??
          (api
            ? "evidence/api/test-results.json"
            : "evidence/qa/playwright-results.json"),
      },
    ],
  ],
  use: {
    baseURL: origin,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testDir: "./tests/e2e",
      use: { browserName: "chromium" },
    },
    {
      name: "webkit",
      testDir: "./tests/e2e",
      use: { browserName: "webkit", viewport: { width: 390, height: 844 } },
    },
    { name: "api", testDir: "./tests/api" },
  ],
  webServer: api
    ? [app]
    : [
        app,
        {
          command:
            "python3 -m http.server 6006 --bind 127.0.0.1 --directory apps/ui-lab/dist",
          url: "http://127.0.0.1:6006/iframe.html",
          reuseExistingServer: !process.env.CI,
          timeout: 30000,
        },
      ],
});
