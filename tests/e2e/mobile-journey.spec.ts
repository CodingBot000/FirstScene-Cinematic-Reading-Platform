import { expect, test } from "@playwright/test";

const widths = [320, 390, 430] as const;
const publicPages = [
  "/",
  "/discover",
  "/stories/post-office",
  "/read/post-office",
  "/library",
  "/settings",
] as const;

for (const width of widths) {
  test(`${width}px public mobile journey keeps navigation and content within the viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const route of publicPages) {
      await page.goto(route);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

      const geometry = await page.evaluate(() => {
        const root = document.documentElement;
        const nav = document.querySelector<HTMLElement>(".site-header nav");
        const toolbar = document.querySelector<HTMLElement>(".fs-reading-toolbar");
        return {
          viewport: innerWidth,
          overflow: root.scrollWidth - root.clientWidth,
          navRight: nav?.getBoundingClientRect().right ?? null,
          toolbarRight: toolbar?.getBoundingClientRect().right ?? null,
        };
      });
      expect(geometry.overflow, route).toBeLessThanOrEqual(1);
      if (geometry.navRight !== null) {
        expect(geometry.navRight, route).toBeLessThanOrEqual(width + 1);
      }
      if (geometry.toolbarRight !== null) {
        expect(geometry.toolbarRight, route).toBeLessThanOrEqual(width + 1);
      }
    }
  });
}

test("390px touch journey: discover → introduction → reader → toolbar dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("link", { name: "탐색", exact: true }).click();
  await expect(page).toHaveURL(/\/discover$/);

  await page.getByRole("radio", { name: /지금 읽기 2/ }).check();
  await expect(page.locator(".discovery-finished-card")).toHaveCount(2);
  await page
    .locator('.discovery-finished-card [data-story="post-office"]')
    .getByRole("link", { name: "이야기 만나기" })
    .click();
  await expect(page).toHaveURL(/\/stories\/post-office$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "빛을 접어 보내는 우체국",
  );
  await page.getByRole("link", { name: "첫 장면 읽기" }).click();
  await expect(page).toHaveURL(/\/read\/post-office/);
  await expect(page.locator(".fs-reader")).toBeVisible();

  await page.getByRole("button", { name: "설정", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("읽기 모드");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "설정" })).toBeFocused();

  await page.getByRole("button", { name: "목차" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("여섯 장면");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("mobile discover filters do not strand reader-only selections in upcoming genres", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/discover");
  await page.getByRole("radio", { name: /지금 읽기 2/ }).check();
  await page.getByRole("radio", { name: "미스터리 · 도시" }).check();
  await expect(page.getByRole("radio", { name: /공개 예정 34/ })).toBeChecked();
  await expect(page.locator(".discovery-preview-card")).toHaveCount(7);
  await expect(page).toHaveURL(/genre=city/);

  await page.getByRole("radio", { name: /지금 읽기 2/ }).check();
  await expect(page.getByRole("radio", { name: "모든 장르" })).toBeChecked();
  await expect(page.locator(".discovery-finished-card")).toHaveCount(2);
  await expect(page.locator(".discovery-preview-card")).toHaveCount(0);
});

test("390px discover and settings controls preserve 44px touch targets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/discover");
  const search = page.getByRole("searchbox", { name: "작품 제목 검색" });
  await expect(search).toHaveCSS("font-size", "16px");

  for (const selector of [
    ".discovery-status-filters label",
    ".discovery-mood-filters label",
    ".discovery-genre-options label",
    ".discovery-reset",
  ]) {
    const heights = await page.locator(selector).evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
    expect(heights.length).toBeGreaterThan(0);
    for (const height of heights) expect(height, selector).toBeGreaterThanOrEqual(43.5);
  }

  await page.getByRole("link", { name: "설정", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.locator(".settings-fieldset")).toBeEnabled();
  await expect(page.getByRole("radio", { name: "일반 읽기" })).toBeVisible();
  const controlHeights = await page.locator(".settings-fieldset .fs-radio").evaluateAll(
    (elements) => elements.map((element) => element.getBoundingClientRect().height),
  );
  for (const height of controlHeights) expect(height).toBeGreaterThanOrEqual(43.5);
});

test("library on an untouched browser shows an actionable empty state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/library");
  await expect(
    page.getByText("아직 남긴 독서 기록이 없어요.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "이야기 만나기" })).toHaveAttribute(
    "href",
    "/discover",
  );
  await expect(page.locator(".library-section")).toHaveCount(3);
  await expect(page.locator(".library-section").first()).toBeHidden();
});
