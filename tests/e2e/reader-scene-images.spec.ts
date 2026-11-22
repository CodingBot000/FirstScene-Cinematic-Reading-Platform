import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Story } from "@firstscene/story-schema";

for (const storyId of ["post-office", "tide-station"]) {
  test(`cinematic ${storyId}: all authored scene pictures are visible in desktop and mobile reading flow`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const story = JSON.parse(
      readFileSync(`content/generated/stories/${storyId}.json`, "utf8"),
    ) as Story;
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/read/${storyId}`);
      await expect(page.locator("[data-reader-ready]")).toHaveAttribute(
        "data-reader-ready",
        "true",
      );
      const reader = page.locator(".fs-reader-cinematic");
      await expect(reader).toBeVisible();
      const scenes = reader.locator(".fs-reader-scene");
      await expect(scenes).toHaveCount(story.scenes.length);
      const inline = reader.locator(".fs-reader-scene-image");
      await expect(inline).toHaveCount(story.scenes.length);
      if (width > 1024) {
        await expect(reader.locator(".fs-reader-stage")).toBeVisible();
        // Desktop is not allowed to replace the real scene assets with placeholders.
        await expect(inline.locator("picture > img")).toHaveCount(
          story.scenes.length +
            story.scenes.filter((scene) => scene.portraitAssetId).length,
        );
      } else {
        await expect(reader.locator(".fs-reader-stage")).toBeHidden();
      }
      for (const index of [0, 2, 5]) {
        const scene = story.scenes[index]!;
        await scenes.nth(index).locator(".fs-reader-beat p").first().evaluate((element) => {
          const rect = element.getBoundingClientRect();
          scrollTo({
            top: scrollY + rect.top + rect.height * 0.2 - innerHeight * 0.42,
            behavior: "instant",
          });
        });
        await expect(reader).toHaveAttribute("data-active-scene", scene.id);
        const picture = inline.nth(index).locator(":scope > picture");
        await expect(picture).toBeVisible();
        const image = picture.locator("img");
        await expect(image).toHaveCount(1);
        await expect
          .poll(() =>
            image.evaluate((el, assetId) => {
              const img = el as HTMLImageElement;
              return (
                img.complete &&
                img.naturalWidth > 0 &&
                img.currentSrc.includes(assetId)
              );
            }, scene.backgroundAssetId),
          )
          .toBe(true);
        await expect(scenes.nth(index).locator(".fs-reader-beat").first()).toBeVisible();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
  });
}
