import { defineConfig } from "@playwright/test";
const origin = process.env.FIRSTSCENE_VISUAL_ORIGIN;
if (!origin || new URL(origin).hostname !== "127.0.0.1")
  throw new Error("OWNED_VISUAL_ORIGIN_REQUIRED");
export default defineConfig({
  testDir: "../tests/visual",
  outputDir: "../artifacts/private/visual-test-results",
  workers: 1,
  retries: 0,
  timeout: 120000,
  reporter: [
    ["list"],
    ["json", { outputFile: "../evidence/visual/current/browser-results.json" }],
  ],
  use: {
    baseURL: origin,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    actionTimeout: 10000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "visual1440",
      use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "visual1024",
      testMatch: /responsive(?:-reader)?\.spec\.ts/,
      use: { browserName: "chromium", viewport: { width: 1024, height: 768 } },
    },
    {
      name: "visual390",
      use: { browserName: "chromium", viewport: { width: 390, height: 844 } },
    },
    {
      name: "visual320",
      testMatch: /responsive(?:-reader)?\.spec\.ts/,
      use: { browserName: "chromium", viewport: { width: 320, height: 740 } },
    },
    {
      name: "visual-webkit390",
      testMatch: /responsive(?:-reader)?\.spec\.ts/,
      use: { browserName: "webkit", viewport: { width: 390, height: 844 } },
    },
  ],
});
