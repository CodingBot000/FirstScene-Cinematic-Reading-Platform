import { defineConfig } from "@playwright/test";
const baseURL = process.env.FIRSTSCENE_CONSUMER_URL;
if (!baseURL || new URL(baseURL).hostname !== "127.0.0.1")
  throw new Error("OWNED_CONSUMER_URL_REQUIRED");
export default defineConfig({
  outputDir: "../artifacts/private/consumer-test-results",
  testDir: "../tests/consumer",
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: "../evidence/package-consumer/browser-results.json" },
    ],
  ],
  use: {
    baseURL,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "consumer-chromium", use: { browserName: "chromium" } },
    {
      name: "consumer-webkit",
      use: { browserName: "webkit", viewport: { width: 390, height: 844 } },
    },
  ],
});
