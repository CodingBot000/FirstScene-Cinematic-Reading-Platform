import { expect, test } from "@playwright/test";

test("discover separates 2 originals, 20 readable classics and 34 unpublished concepts", async ({
  page,
}) => {
  await page.goto("/discover");
  await expect(page.getByRole("status")).toContainText("56편의 이야기");
  await expect(page.locator(".discovery-finished-card")).toHaveCount(2);
  await expect(page.locator(".discovery-classic-card")).toHaveCount(20);
  await expect(page.locator(".discovery-preview-card")).toHaveCount(34);

  await page.getByRole("radio", { name: /지금 읽기 22/ }).check();
  await expect(page.getByRole("status")).toContainText("22편의 이야기");
  await expect(page.locator(".discovery-preview-card")).toHaveCount(0);
  await expect(page.locator(".discovery-finished-card")).toHaveCount(2);
  await expect(page.locator(".discovery-classic-card")).toHaveCount(20);

  await page.getByRole("radio", { name: /공개 예정 34/ }).check();
  await expect(page.locator(".discovery-preview-card")).toHaveCount(34);
  await expect(page.locator(".discovery-finished-card")).toHaveCount(0);
  await expect(page.locator(".discovery-classic-card")).toHaveCount(0);

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

  const search = page.getByRole("searchbox", { name: "작품 제목 검색" });
  await search.fill("지도");
  await expect(page.locator(".discovery-preview-card")).toHaveCount(1);
  await expect(page.getByRole("status")).toContainText("1편의 이야기");
  await expect(page).toHaveURL(/q=/);

  await page.getByRole("button", { name: "필터 초기화" }).click();
  await expect(page.locator(".discovery-preview-card")).toHaveCount(34);
  await expect(page.getByRole("status")).toContainText("56편의 이야기");
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

test("mobile catalog keeps input entered before hydration and restores search history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/discover?q=" + encodeURIComponent("동백꽃"));
  const search = page.getByRole("searchbox", { name: "작품 제목 검색" });
  const results = page.getByRole("status");
  await expect(search).toHaveValue("동백꽃");
  await expect(results).toContainText("1편의 이야기");

  let allowScripts!: () => void;
  const scripts = new Promise<void>((resolve) => {
    allowScripts = resolve;
  });
  let heldRequests = 0;
  await page.route("**/_next/static/**/*.js", async (route) => {
    heldRequests += 1;
    await scripts;
    await route.continue();
  });

  try {
    await page.goto("/discover", { waitUntil: "commit" });
    await expect.poll(() => heldRequests).toBeGreaterThan(0);
    await search.fill("존재하지않는이야기");
    await expect(search).toBeFocused();
    await expect(results).toContainText("56편의 이야기");
  } finally {
    allowScripts();
  }
  await expect(results).toHaveText("0편의 이야기");
  await expect(search).toHaveValue("존재하지않는이야기");
  await expect(search).toBeFocused();
  await expect(page).toHaveURL(/\/discover\?q=/);

  await search.fill("빛");
  await search.fill("우체국");
  await expect(results).toContainText("1편의 이야기");
  await expect(
    page.getByRole("heading", { name: "빛을 접어 보내는 우체국" }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp("/discover\\?q=" + encodeURIComponent("우체국") + "$"),
  );
  await page.getByRole("button", { name: "필터 초기화" }).click();
  await expect(search).toHaveValue("");
  await expect(results).toContainText("56편의 이야기");
  await expect(page).toHaveURL(/\/discover$/);

  await page.goBack();
  await expect(search).toHaveValue("동백꽃");
  await expect(results).toContainText("1편의 이야기");
  await page.goForward();
  await expect(search).toHaveValue("");
  await expect(results).toContainText("56편의 이야기");
});

test.describe("discover works without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("server-rendered catalog respects ready status", async ({ page }) => {
    await page.goto("/discover?status=ready");
    await expect(page.locator(".discovery-finished-card")).toHaveCount(2);
    await expect(page.locator(".discovery-classic-card")).toHaveCount(20);
    await expect(page.locator(".discovery-preview-card")).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("22편의 이야기");
  });
});
