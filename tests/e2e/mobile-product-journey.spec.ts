import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function serverBookmarkCount(page: Page): Promise<number> {
  const response = await page.request.get("/api/v1/me");
  if (response.status() !== 200) return 0;
  const data = (await response.json()) as { bookmarks: unknown[] };
  return data.bookmarks.length;
}

/**
 * Mobile product journey, not isolated component unit tests.
 * The test runtime uses its own disposable database. Never the Neon instance.
 */
const widths = [320, 390, 430] as const;

for (const width of widths) {
  test(`mobile ${width}px: public pages stay readable and controls remain operable`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const path of [
      "/",
      "/discover",
      "/stories/post-office",
      "/library",
      "/settings",
      "/read/post-office",
    ]) {
      await page.goto(path);
      await expect(page.locator("h1")).toHaveCount(1);

      const geometry = await page.evaluate(() => ({
        viewport: window.innerWidth,
        scroll: document.documentElement.scrollWidth,
        main: document.querySelectorAll("main").length,
      }));
      expect(
        geometry.scroll,
        `horizontal overflow at ${path}`,
      ).toBeLessThanOrEqual(geometry.viewport + 1);
      expect(geometry.main).toBe(1);
    }

    await page.goto("/discover");
    await expect(page.getByRole("status")).toContainText("36편의 이야기");

    const tapTargets = await page
      .locator(
        ".discovery-form-wide .mood-filters label, .discovery-genre-options label",
      )
      .evaluateAll((labels) =>
        labels.map((label) => {
          const box = label.getBoundingClientRect();
          return {
            text: label.textContent?.trim() ?? "",
            width: box.width,
            height: box.height,
            left: box.left,
            right: box.right,
          };
        }),
      );
    expect(tapTargets.length).toBeGreaterThanOrEqual(12);
    for (const target of tapTargets) {
      expect(target.height, target.text).toBeGreaterThanOrEqual(44);
      expect(target.width, target.text).toBeGreaterThanOrEqual(44);
      expect(target.left, target.text).toBeGreaterThanOrEqual(-1);
      expect(target.right, target.text).toBeLessThanOrEqual(width + 1);
    }
    await page.getByRole("radio", { name: /지금 읽기 2/ }).check();
    await expect(page.locator(".discovery-finished-card")).toHaveCount(2);
    await page.getByRole("radio", { name: /공개 예정 34/ }).check();
    await page
      .locator(".discovery-preview-card")
      .first()
      .getByRole("button")
      .click();
    await expect(page.getByRole("dialog")).toContainText("공개 준비 중");
    await page.getByRole("button", { name: "닫기" }).click();

    await page.goto("/stories/post-office");
    const firstRead = page.locator(".story-actions .fs-primary");
    await expect(firstRead).toBeVisible();
    const entryTop = await firstRead.evaluate(
      (element) => element.getBoundingClientRect().top + scrollY,
    );
    expect(
      entryTop,
      "first read action is too far down the introduction",
    ).toBeLessThan(844 * 1.25);
    if (width === 390) {
      await page.screenshot({
        path: "evidence/ui/mobile-journey-story-390.png",
        fullPage: false,
      });
    }
  });
}

test("mobile: landing → discovery → introduction → reading → library → settings", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: "탐색" })
    .click();
  await expect(page).toHaveURL(/\/discover$/);

  await page.getByRole("radio", { name: /지금 읽기 2/ }).check();
  await page
    .locator(".discovery-finished-card")
    .first()
    .getByRole("heading", { name: "빛을 접어 보내는 우체국" })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(/\/stories\/post-office$/);
  const bookmark = page.getByRole("button", {
    name: "☆ 작품 저장",
    exact: true,
  });
  await expect(bookmark).toBeEnabled();
  await bookmark.click();
  await expect(
    page.getByRole("button", { name: "★ 작품 저장됨", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => serverBookmarkCount(page)).toBe(1);

  await page.getByRole("link", { name: "첫 장면 읽기", exact: true }).click();
  await expect(page).toHaveURL(/\/read\/post-office/);
  await expect(page.locator("[data-reader-ready]")).toHaveAttribute(
    "data-reader-ready",
    "true",
  );
  await expect(page.locator(".fs-reading-toolbar button")).toHaveCount(3);
  const toolbar = await page
    .locator(".fs-reading-toolbar button")
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { height: rect.height, left: rect.left, right: rect.right };
      }),
    );
  for (const control of toolbar) {
    expect(control.height).toBeGreaterThanOrEqual(44);
    expect(control.left).toBeGreaterThanOrEqual(-1);
    expect(control.right).toBeLessThanOrEqual(391);
  }

  await page.getByRole("button", { name: "← 작품 소개" }).click();
  await expect(page).toHaveURL(/\/stories\/post-office$/);
  await page.getByRole("link", { name: "내 서재" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.locator(".library-stories li")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "저장한 작품" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "설정", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.locator(".settings-fieldset")).toBeEnabled();
  await page.getByRole("radio", { name: "일반 읽기" }).check();
  await expect(page.getByRole("radio", { name: "일반 읽기" })).toBeChecked();
});

test("mobile: anonymous empty library shows one clear invitation, not repeated empty sections", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/library");

  await expect(
    page.getByText("아직 남긴 독서 기록이 없어요.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".library-section")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "이야기 만나기" })).toBeVisible();
  await page.getByRole("link", { name: "이야기 만나기" }).click();
  await expect(page).toHaveURL(/\/discover$/);
});

test("mobile: removing the final saved story restores focus to the empty library action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/stories/post-office");
  const save = page.getByRole("button", { name: "☆ 작품 저장", exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect.poll(() => serverBookmarkCount(page)).toBe(1);

  await page.goto("/library");
  await expect(page.locator(".library-stories li")).toHaveCount(1);
  await page
    .locator(".library-stories")
    .getByRole("button", { name: "저장 해제", exact: true })
    .click();
  await expect(page.getByRole("link", { name: "이야기 만나기" })).toBeFocused();
  await expect(page.locator(".library-section")).toHaveCount(0);
});
