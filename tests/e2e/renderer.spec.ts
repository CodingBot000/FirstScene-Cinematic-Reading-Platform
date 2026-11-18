import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
async function jump(page: Page, id: string) {
  if (new URL(page.url()).pathname.startsWith("/read/"))
    await expect(page.locator("[data-reader-ready]")).toHaveAttribute(
      "data-reader-ready",
      "true",
    );
  await page.locator("#" + id).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    scrollTo({
      top: scrollY + rect.top + rect.height * 0.1 - innerHeight * 0.42,
      behavior: "instant",
    });
  });
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-beat",
    id,
  );
}
test("P03 QA-R02/R03 jump/reverse resolves scene and local mood with at most2stage layers", async ({
  page,
}) => {
  await page.goto("/read/post-office");
  await jump(page, "mail-s04-b03");
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-scene",
    "mail-s04",
  );
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-mood",
    "climax",
  );
  expect(await page.locator("[data-scene-layer]").count()).toBe(2);
  await jump(page, "mail-s01-b05");
  await expect(page.locator(".fs-reader")).toHaveAttribute("data-mood", "calm");
  await expect(page.locator("[data-beat]")).toHaveCount(36);
});
test("P03 QA-R03/U05 decorative text clone is hidden from accessibility and never replays on reverse", async ({
  page,
}) => {
  await page.goto("/read/post-office");
  await jump(page, "mail-s01-b04");
  const paragraph = page.locator("#mail-s01-b04");
  await expect(paragraph.locator('[aria-hidden="true"]')).toBeVisible();
  const snapshot = await paragraph.ariaSnapshot();
  expect(
    snapshot.split("보낸 사람 칸에는 아무 이름도 없었다.").length - 1,
  ).toBe(1);
  await expect(paragraph.locator('[aria-hidden="true"]')).toHaveCount(0);
  await jump(page, "mail-s01-b02");
  await jump(page, "mail-s01-b04");
  await expect(paragraph.locator('[aria-hidden="true"]')).toHaveCount(0);
});
test("P03 QA-R09 typewriter supports immediate show and Escape without leaving hidden text", async ({
  page,
}) => {
  await page.goto("/read/post-office");
  await jump(page, "mail-s04-b04");
  const paragraph = page.locator("#mail-s04-b04");
  const show = page.getByRole("button", { name: "즉시 표시", exact: true });
  await expect(show).toBeVisible();
  await show.click();
  await expect(paragraph).toHaveText(
    "“잘 도착해. 이번에는 네가 기다리는 곳으로.”",
  );
  await expect(paragraph.locator('[aria-hidden="true"]')).toHaveCount(0);
  await page.goto("/read/tide-station");
  await jump(page, "tide-s04-b04");
  await expect(
    page.getByRole("button", { name: "즉시 표시", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#tide-s04-b04")).toHaveText(
    "“소음이 아니라, 누군가 살던 자리야.”",
  );
});
test("P03 QA-R10 missing Segmenter retains full original text without effects", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(Intl, "Segmenter", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto("/read/post-office");
  await jump(page, "mail-s01-b04");
  await expect(page.locator("#mail-s01-b04")).toHaveText(
    "보낸 사람 칸에는 아무 이름도 없었다.",
  );
  await expect(page.locator(".fs-effect-clone")).toHaveCount(0);
});
test("P03 QA-R11 actual broken image URLs in framework-neutral consumer preserve dimensions and all text", async ({
  page,
}) => {
  let failures = 0;
  page.on("response", (response) => {
    if (
      response.url().includes("intentionally-missing") &&
      response.status() === 404
    )
      failures++;
  });
  await page.goto(
    "http://127.0.0.1:6006/iframe.html?id=firstscene-reader--missing-images&viewMode=story",
  );
  await expect(page.locator("[data-beat]")).toHaveCount(36);
  await expect.poll(() => failures).toBeGreaterThan(0);
  await expect(page.locator('img[data-failed="true"]').first()).toHaveAttribute(
    "width",
    "960",
  );
  await expect(page.locator("#mail-s06-b06")).toContainText(
    "기다리는 시간이 생겼지만",
  );
});
test("P03 QA-R11 GSAP chunk failure leaves original paragraph available", async ({
  page,
}) => {
  let aborted = 0;
  await page.route(/\/assets\/motion-[^/]+\.js$/, (route) => {
    aborted++;
    return route.abort("failed");
  });
  await page.goto(
    "http://127.0.0.1:6006/iframe.html?id=firstscene-reader--missing-images&viewMode=story",
  );
  await jump(page, "mail-s01-b04");
  await expect.poll(() => aborted).toBeGreaterThan(0);
  await expect(page.locator("#mail-s01-b04")).toHaveText(
    "보낸 사람 칸에는 아무 이름도 없었다.",
  );
  await expect(page.locator(".fs-effect-clone")).toHaveCount(0);
});
test("P03 OS reduced motion changes stop effects immediately and settings keep text readable", async ({
  page,
}) => {
  await page.goto("/read/post-office");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-motion",
    "reduced",
  );
  await jump(page, "mail-s01-b04");
  await expect(page.locator(".fs-effect-clone")).toHaveCount(0);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByRole("radio", { name: "일반 읽기", exact: true }).check();
  await expect(page.locator(".fs-reader")).toHaveClass(/fs-reader-plain/);
  await expect(page.locator("[data-beat]")).toHaveCount(36);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "설정", exact: true }),
  ).toBeFocused();
});
