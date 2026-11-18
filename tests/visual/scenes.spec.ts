import { test, expect } from "@playwright/test";
import fs from "node:fs";
import type { Story } from "@firstscene/story-schema";
import { capture, readerReady, toolbar, axe } from "./helpers";
test("both complete stories render all twelve real images and local moods in forward and reverse order", async ({
  page,
}) => {
  for (const storyId of ["post-office", "tide-station"]) {
    const story = JSON.parse(
      fs.readFileSync(`content/generated/stories/${storyId}.json`, "utf8"),
    ) as Story;
    await page.goto(`/read/${storyId}#${story.scenes[0]!.beats[0]!.id}`);
    await readerReady(page);
    await toolbar(page);
    const sequence = [...story.scenes, ...[...story.scenes].reverse()];
    for (let step = 0; step < sequence.length; step++) {
      const scene = sequence[step]!,
        beat = scene.beats[0]!;
      await page.locator("#" + beat.id).evaluate((element) => {
        const r = element.getBoundingClientRect();
        scrollTo({
          top: scrollY + r.top + r.height * 0.2 - innerHeight * 0.42,
          behavior: "instant",
        });
      });
      await expect(page.locator(".fs-reader")).toHaveAttribute(
        "data-active-scene",
        scene.id,
      );
      await expect(page.locator(".fs-reader")).toHaveAttribute(
        "data-mood",
        beat.mood ?? scene.mood,
      );
      await expect(page.locator(".fs-effect-clone")).toHaveCount(0);
      const image =
        page.viewportSize()!.width > 1024
          ? page.locator('[data-scene-layer="current"] img')
          : page
              .locator(".fs-reader-scene")
              .filter({ has: page.locator("#" + scene.id) })
              .locator(".fs-reader-mobile-image > picture > img");
      await expect
        .poll(() =>
          image.evaluate(
            (img, assetId) => ({
              loaded:
                (img as HTMLImageElement).complete &&
                (img as HTMLImageElement).naturalWidth > 0,
              url: (img as HTMLImageElement).currentSrc.includes(assetId),
            }),
            scene.backgroundAssetId,
          ),
        )
        .toEqual({ loaded: true, url: true });
      if (step < story.scenes.length) {
        if (page.viewportSize()!.width > 1024)
          await expect
            .poll(() =>
              page
                .locator('[data-scene-layer="current"]')
                .evaluate((element) =>
                  Number(getComputedStyle(element).opacity),
                ),
            )
            .toBe(1);
        await capture(page, scene.id, "cinematic", beat.mood ?? scene.mood);
      }
    }
    await expect(page.locator(".fs-reader-main p.fs-type-reading")).toHaveCount(
      36,
    );
    await axe(page);
  }
});
