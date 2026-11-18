import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("P06 shared gallery shows real type/control states and an accessible reading sample", async ({
  page,
}) => {
  await page.goto("/design-system");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const sample = page.getByRole("region", { name: "공유 읽기 스타일 예시" });
  await expect(sample.locator("p")).toHaveCount(2);
  await expect(sample.locator("p").first()).toHaveCSS("font-size", "20px");
  await expect(sample).toContainText("바다가 보이는 언덕의 우체국");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `evidence/package-consumer/current/design-system-${page.viewportSize()!.width}.png`,
    fullPage: true,
  });
});
