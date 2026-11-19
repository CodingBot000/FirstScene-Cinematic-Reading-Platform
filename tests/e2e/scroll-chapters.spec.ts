import { expect, test } from "@playwright/test";

test("desktop scroll scrubs three scenes and allows skipping to finished work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");

  const prologue = page.locator(".cinematic-prologue");
  await expect(prologue).toHaveAttribute("data-scroll-mode", "pinned", {
    timeout: 12000,
  });
  await expect(prologue).toHaveAttribute("data-scene", "0");

  await page.evaluate(() => {
    const root = document.querySelector(".cinematic-prologue")!;
    window.scrollTo(0, root.getBoundingClientRect().top + scrollY + innerHeight * 1.4);
  });
  await expect(prologue).toHaveAttribute("data-scene", "1");
  const pinnedTop = await prologue.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  expect(Math.abs(pinnedTop)).toBeLessThan(16);

  await page.evaluate(() => {
    const spacer = document.querySelector(".cinematic-prologue")!.parentElement!;
    window.scrollTo(0, spacer.getBoundingClientRect().top + scrollY + innerHeight * 2.1);
  });
  await expect(prologue).toHaveAttribute("data-scene", "2");

  await page.getByRole("link", { name: /연출 건너뛰기/ }).click();
  await expect(page).toHaveURL(/#read-now$/);
  await expect(page.getByRole("heading", { name: "지금 읽을 수 있는 두 편" })).toBeVisible();
});

test("reduced motion keeps all text visible and releases pinned layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const prologue = page.locator(".cinematic-prologue");
  await expect(prologue).toHaveAttribute("data-scroll-mode", "static");
  await expect(page.locator("[data-cinematic-beat]")).toHaveCount(3);
  for (const beat of await page.locator("[data-cinematic-beat]").all()) {
    await expect(beat).toBeVisible();
  }

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(prologue).toHaveAttribute("data-scroll-mode", "pinned", {
    timeout: 12000,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(prologue).toHaveAttribute("data-scroll-mode", "static");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(page.locator("[data-cinematic-beat='2']")).toBeVisible();
});

test("mobile is a native scroll page with usable chapter links and preview dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator(".cinematic-prologue")).toHaveAttribute(
    "data-scroll-mode",
    "static",
  );
  await expect(page.locator(".cinematic-prologue h1")).toBeVisible();
  await expect(page.locator(".cinematic-prologue h2")).toHaveCount(2);
  await page.locator("#preview-city").scrollIntoViewIfNeeded();
  await expect(
    page.locator('.preview-jump-nav a[href="#preview-city"]'),
  ).toHaveAttribute("aria-current", "location");
  await page
    .getByRole("button", { name: /지하철이 지나지 않는 역, 공개 준비 중 안내 열기/ })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("공개 준비 중");
  await page.getByRole("button", { name: "닫기" }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  ).toBe(true);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("prologue remains readable and the first story is reachable", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".cinematic-prologue")).toHaveAttribute(
      "data-scroll-mode",
      "static",
    );
    await expect(page.locator("[data-cinematic-beat]")).toHaveCount(3);
    await expect(
      page.getByRole("link", { name: /첫 장면 바로 읽기/ }),
    ).toHaveAttribute("href", "/read/post-office");
    await expect(page.getByRole("heading", { name: /서른네 개의 세계/ })).toBeVisible();
  });
});
