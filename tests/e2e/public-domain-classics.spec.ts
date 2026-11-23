import { expect, test } from "@playwright/test";

test("a classic is a full-length SSR document with author and source attribution", async ({
  page,
}) => {
  const response = await page.goto("/classics/classic-lucky-day");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "운수 좋은 날" }),
  ).toBeVisible();
  await expect(
    page.locator('[data-classic-text="classic-lucky-day"]'),
  ).toContainText("김첨지");
  await expect(
    page.locator('[data-classic-text="classic-lucky-day"]'),
  ).toContainText("설렁탕");
  await expect(
    page.getByRole("link", { name: "한국저작권위원회 공유마당" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "IMHOGYUN/TM_PROJECT" }),
  ).toBeVisible();
  expect(
    (await page.locator("[data-classic-text]").innerText()).length,
  ).toBeGreaterThan(4000);
});

test("the classic reader works without JavaScript and fits mobile screens", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const response = await page.goto(baseURL + "/classics/classic-camellias");
  expect(response?.status()).toBe(200);
  await expect(
    page.locator('[data-classic-text="classic-camellias"]'),
  ).toContainText("점순");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await context.close();
});

test("an unknown classic returns 404", async ({ page }) => {
  const response = await page.goto("/classics/does-not-exist");
  expect(response?.status()).toBe(404);
});
