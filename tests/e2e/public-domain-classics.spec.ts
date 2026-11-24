import { expect, test } from "@playwright/test";

test("a classic is a full-length SSR document with author and source attribution", async ({
  page,
}) => {
  const response = await page.goto("/read/classic-lucky-day");
  expect(response?.status()).toBe(200);
  await expect(page.locator(".reader-page .fs-reading-toolbar")).toBeVisible();
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
  await expect(
    dialogue.filter({ hasText: "그럼 혼자 하지 떼루 하디?" }),
  ).toHaveCount(1);
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
  await expect(page).toHaveURL(/\/read\/classic-camellias$/);
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
  await page.getByRole("link", { name: "작품 소개" }).click();
  await expect(page).toHaveURL(/\/stories\/classic-camellias$/);
  await context.close();
});

test("an unknown classic returns 404", async ({ page }) => {
  const response = await page.goto("/classics/does-not-exist");
  expect(response?.status()).toBe(404);
});

test("a classic card opens the shared story detail and reading screen", async ({
  page,
}) => {
  await page.goto("/discover?status=ready");
  await page.getByRole("link", { name: "동백꽃, 김유정 작품 소개" }).click();
  await expect(page).toHaveURL(/\/stories\/classic-camellias$/);
  const detail = page.locator(".story-detail");
  await expect(detail.getByRole("heading", { name: "동백꽃" })).toBeVisible();
  await expect(detail.getByText("고전 · 김유정")).toBeVisible();
  const cover = detail.getByRole("img", { name: "동백꽃 표지" });
  await expect(cover).toBeVisible();
  await expect
    .poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await detail.getByRole("link", { name: "처음부터 읽기" }).click();
  await expect(page).toHaveURL(/\/read\/classic-camellias$/);
  await expect(page.locator(".fs-reader-plain .fs-reader-main")).toBeVisible();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "읽기 설정" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("radio", { name: "24px", exact: true }).check();
  await expect(page.locator("[data-classic-text] > p").first()).toHaveCSS(
    "font-size",
    "24px",
  );
  await dialog.getByRole("radio", { name: "밝게", exact: true }).check();
  await expect(page.locator(".reader-page")).toHaveAttribute(
    "data-theme",
    "light",
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "설정", exact: true }),
  ).toBeFocused();
});
