import { expect, test } from "@playwright/test";

test("discover presents two readable stories plus 34 clearly unpublished concepts", async ({
  page,
}) => {
  await page.goto("/discover");
  await expect(page.getByRole("status")).toContainText("36편의 이야기");
  await expect(page.locator(".discovery-finished-card")).toHaveCount(2);
  await expect(page.locator(".discovery-preview-card")).toHaveCount(34);

  await page.getByRole("radio", { name: /지금 읽기 2/ }).check();
  await expect(page.getByRole("status")).toContainText("2편의 이야기");
  await expect(page.locator(".discovery-preview-card")).toHaveCount(0);
  await expect(page.locator(".discovery-finished-card")).toHaveCount(2);

  await page.getByRole("radio", { name: /공개 예정 34/ }).check();
  await expect(page.locator(".discovery-preview-card")).toHaveCount(34);
  await expect(page.locator(".discovery-finished-card")).toHaveCount(0);

  await page
    .getByRole("button", { name: /새벽 0시의 복원실, 공개 준비 중 안내 열기/ })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    "본문과 읽기 기능은 아직 공개되지 않았습니다.",
  );
  await page.getByRole("button", { name: "닫기" }).click();
});

test("genre and title filtering preserve query URL and remain keyboard operable", async ({
  page,
}) => {
  await page.goto("/discover");
  await page.getByRole("radio", { name: "미스터리 · 도시" }).check();
  await expect(page.locator(".discovery-preview-card")).toHaveCount(7);
  await expect(page).toHaveURL(/genre=city/);

  const search = page.getByRole("searchbox", { name: "작품 찾기" });
  await search.fill("지도");
  await expect(page.locator(".discovery-preview-card")).toHaveCount(1);
  await expect(page.getByRole("status")).toContainText("1편의 이야기");
  await expect(page).toHaveURL(/q=/);

  await page.getByRole("button", { name: "필터 초기화" }).click();
  await expect(page.locator(".discovery-preview-card")).toHaveCount(34);
  await expect(page.getByRole("status")).toContainText("36편의 이야기");
});

test("mobile discovery is not horizontally clipped", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/discover");
  await expect(page.locator(".discovery-preview-card")).toHaveCount(34);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test.describe("discover works without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("server-rendered catalog respects ready status", async ({ page }) => {
    await page.goto("/discover?status=ready");
    await expect(page.locator(".discovery-finished-card")).toHaveCount(2);
    await expect(page.locator(".discovery-preview-card")).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("2편의 이야기");
  });
});
