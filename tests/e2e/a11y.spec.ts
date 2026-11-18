import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("P03 axe reader and settings have no detected AA violations", async ({
  page,
}) => {
  await page.goto("/read/post-office");
  let result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({
    path: "evidence/ui/reader-settings-current.png",
    fullPage: false,
  });
});
test("P03 capture renderer composition at desktop and mobile", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/read/post-office");
    await expect(page.locator(".fs-reader")).toHaveAttribute(
      "data-motion",
      "reduced",
    );
    await page.screenshot({
      path: `evidence/ui/reader-current-${viewport.width}.png`,
      fullPage: false,
    });
  }
});
