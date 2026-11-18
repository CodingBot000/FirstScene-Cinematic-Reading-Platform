import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const lock = JSON.parse(fs.readFileSync("execution/browser-runtime-lock.json"));
const pkg = JSON.parse(
  fs.readFileSync("node_modules/@playwright/test/package.json"),
);
const pnpm = execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim();
if (
  pkg.version !== lock.playwrightVersion ||
  pnpm !== lock.pnpmVersion ||
  (process.env.GITHUB_ACTIONS === "true" && process.version !== "v24.22.3")
)
  throw new Error("CI_BROWSER_TOOLCHAIN_MISMATCH");
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(
    "<button onclick=\"this.textContent = 'Clicked'\">Check</button>",
  );
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Clicked" }).waitFor();
  const result = {
    status: "PASS",
    browser: browser.version(),
    playwright: pkg.version,
    node: process.version,
    pnpm,
    platform: process.platform,
    arch: process.arch,
  };
  fs.mkdirSync("evidence/ci", { recursive: true });
  fs.writeFileSync(
    "evidence/ci/host-chromium.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
