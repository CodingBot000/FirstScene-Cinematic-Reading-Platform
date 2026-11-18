import { test, expect } from "@playwright/test";
import {
  capture,
  readerReady,
  saved,
  toolbar,
  axe,
  settlePublicImages,
} from "./helpers";
test("saved library, reader settings, plain/reduced and actual image-failure states retain readable controls", async ({
  page,
}) => {
  await page.goto("/stories/post-office");
  await page.getByRole("button", { name: "☆ 작품 저장", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "★ 작품 저장됨", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: /첫 장면 읽기/ }).click();
  await readerReady(page);
  await page
    .locator("#mail-s01-b01")
    .locator("..")
    .getByRole("button", { name: "이 문장 저장", exact: true })
    .click();
  await saved(page);
  await toolbar(page);
  const tooltipOverlap = await page
    .locator(".fs-reader-main")
    .evaluate((root) => {
      const paragraphs = [...root.querySelectorAll("p")].map((paragraph) =>
        paragraph.getBoundingClientRect(),
      );
      return [...root.querySelectorAll(".fs-tooltip")]
        .filter((tooltip) => getComputedStyle(tooltip).visibility === "visible")
        .reduce((sum, tooltip) => {
          const r = tooltip.getBoundingClientRect();
          return (
            sum +
            paragraphs.reduce(
              (area, p) =>
                area +
                Math.max(
                  0,
                  Math.min(r.right, p.right) - Math.max(r.left, p.left),
                ) *
                  Math.max(
                    0,
                    Math.min(r.bottom, p.bottom) - Math.max(r.top, p.top),
                  ),
              0,
            )
          );
        }, 0);
    });
  expect(tooltipOverlap).toBe(0);
  await capture(page, "reader-bookmark", "cinematic", "saved");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("radio", { name: "24px", exact: true }).check();
  await axe(page);
  await capture(page, "reader-settings", "cinematic", "font24");
  await page.getByRole("radio", { name: "일반 읽기", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "설정", exact: true }),
  ).toBeFocused();
  await saved(page);
  await axe(page);
  await capture(page, "reader", "plain", "font24");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByRole("radio", { name: "연출 읽기", exact: true }).check();
  await page.getByRole("radio", { name: "20px", exact: true }).check();
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-motion",
    "reduced",
  );
  await saved(page);
  await axe(page);
  await capture(page, "reader", "cinematic", "os-reduced");
  await page.goto("/library");
  await expect(page.getByText("저장한 문장", { exact: true })).toBeVisible();
  const progressText = await page
    .getByText(/최대로 읽은 위치 약 \d+%/)
    .innerText();
  const percentage = Number(progressText.match(/\d+/)![0]);
  expect(
    await page
      .locator("progress")
      .evaluate((progress) => (progress as HTMLProgressElement).position),
  ).toBeCloseTo(percentage / 100, 5);
  await settlePublicImages(page);
  await axe(page);
  await capture(page, "library", "paper", "full", true);
  await page.route("**/assets/tide-bg-*.**", (route) => route.abort("failed"));
  await page.goto("/read/tide-station#tide-s01-b01");
  await readerReady(page);
  await expect(page.locator('img[data-failed="true"]').first()).toBeAttached();
  await expect(page.locator("#tide-s01-b01")).toBeVisible();
  await expect(page.locator(".fs-reader-main p.fs-type-reading")).toHaveCount(
    36,
  );
  await toolbar(page);
  await axe(page);
  await capture(page, "reader-tide", "reduced", "image-failure");
});
