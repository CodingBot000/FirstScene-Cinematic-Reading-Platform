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

test("collapsed classics render real prose and individual dialogue paragraphs", async ({
  page,
}) => {
  for (const id of [
    "classic-lucky-day",
    "classic-camellias",
    "classic-manmubang",
    "classic-readymade-life",
  ]) {
    const response = await page.goto("/classics/" + id);
    expect(response?.status()).toBe(200);
    const paragraphs = page.locator("[data-classic-text] > p");
    expect(await paragraphs.count()).toBeGreaterThan(40);
    expect(
      await page.locator('p[data-paragraph-kind="dialogue"]').count(),
    ).toBeGreaterThan(20);
    const longest = await paragraphs.evaluateAll((blocks) =>
      Math.max(...blocks.map((block) => block.textContent?.length ?? 0)),
    );
    expect(longest).toBeLessThan(400);
  }

  await page.goto("/classics/classic-camellias");
  const dialogue = page.locator(
    '[data-classic-text] > p[data-paragraph-kind="dialogue"]',
  );
  await expect(dialogue.filter({ hasText: "그럼 혼자 하지 떼루 하디?" })).toHaveCount(1);
  await expect(dialogue.filter({ hasText: "너 일하기 좋니?" })).toHaveCount(1);
  await expect(
    dialogue.filter({
      hasText: /그럼 혼자 하지 떼루 하디\?[\s\S]*너 일하기 좋니\?/u,
    }),
  ).toHaveCount(0);
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
  expect(await page.locator("[data-classic-text] > p").count()).toBeGreaterThan(
    40,
  );
  expect(
    await page.locator('p[data-paragraph-kind="dialogue"]').count(),
  ).toBeGreaterThan(20);
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
