import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Story } from "@firstscene/story-schema";

const stories = ["post-office", "tide-station"].map(
  (id) =>
    JSON.parse(
      readFileSync(
        new URL(`../../content/generated/stories/${id}.json`, import.meta.url),
        "utf8",
      ),
    ) as Story,
);

const classicCover = "cover-classic-camellias";
const stationCover = "cover-tide-station";

async function observeCoverMovement(page: Page, name: string) {
  await page.evaluate((coverName) => {
    function sample() {
      const animations = document.getAnimations();
      const moved = animations.some(
        ({ effect }) =>
          effect instanceof KeyframeEffect &&
          effect.pseudoElement === `::view-transition-group(${coverName})` &&
          Number(effect.getTiming().duration) > 0,
      );
      if (moved) {
        document.documentElement.dataset.checkedCoverMotion = coverName;
        return;
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }, name);
}

async function scrollToBeat(page: Page, beatId: string) {
  await page.locator("#" + beatId).evaluate((paragraph) => {
    const { top } = paragraph.getBoundingClientRect();
    window.scrollTo({
      top: window.scrollY + top + 8 - window.innerHeight * 0.42,
      behavior: "instant",
    });
  });
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-beat",
    beatId,
  );
}

async function enterSecondScene(page: Page) {
  await scrollToBeat(page, "tide-s02-b01");
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-scene",
    "tide-s02",
  );
  await expect(page.locator(".fs-scene-count")).toHaveText("2/6");
}

test("the selected classic and original covers move from the catalog to their details", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/discover?status=ready");
  const classic = page.getByRole("link", {
    name: "동백꽃, 김유정 작품 소개",
    exact: true,
  });
  await classic.scrollIntoViewIfNeeded();
  await classic
    .locator("img")
    .evaluate((image) => (image as HTMLImageElement).decode());
  await observeCoverMovement(page, classicCover);
  await classic.click();
  await expect(page).toHaveURL(/\/stories\/classic-camellias$/);
  await expect(page.locator("html")).toHaveAttribute(
    "data-checked-cover-motion",
    classicCover,
  );
  await expect(page.getByRole("img", { name: "동백꽃 표지" })).toBeVisible();

  await page.goto("/discover?status=ready");
  const original = page.getByRole("link", {
    name: "수심 없는 역의 오리지널 표지",
    exact: true,
  });
  await original.scrollIntoViewIfNeeded();
  await original
    .locator("img")
    .evaluate((image) => (image as HTMLImageElement).decode());
  await observeCoverMovement(page, stationCover);
  await original.focus();
  await original.press("Enter");
  await expect(page).toHaveURL(/\/stories\/tide-station$/);
  await expect(page.locator("html")).toHaveAttribute(
    "data-checked-cover-motion",
    stationCover,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "수심 없는 역" }),
  ).toBeVisible();
});

test("original and classic reading starts continue the cover into the reader", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const [id, name, button] of [
    ["post-office", "빛을 접어 보내는 우체국", "첫 장면 읽기"],
    ["tide-station", "수심 없는 역", "첫 장면 읽기"],
    ["classic-camellias", "동백꽃", "처음부터 읽기"],
  ]) {
    await page.goto("/stories/" + id, { waitUntil: "networkidle" });
    await page
      .locator(".detail-cover img")
      .evaluate((element) => (element as HTMLImageElement).decode());
    await page.evaluate((storyId) => {
      function sample() {
        const opened = document
          .getAnimations()
          .some(
            (animation) =>
              animation instanceof CSSAnimation &&
              animation.animationName === "story-open-art" &&
              animation.effect instanceof KeyframeEffect &&
              animation.effect.pseudoElement ===
                `::view-transition-new(cover-${storyId})`,
          );
        if (opened) {
          document.documentElement.dataset.checkedOpening = storyId;
          return;
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }, id);
    await page.getByRole("link", { name: button, exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/read/" + id + "(?:#.*)?$"));
    await expect(page.locator("html")).toHaveAttribute(
      "data-checked-opening",
      id,
    );
    await expect(
      page.getByRole("heading", { level: 1, name, exact: true }),
    ).toBeVisible();
    if (id.startsWith("classic-")) {
      await expect(page.locator(".classic-reading-cover")).toBeVisible();
      await expect(
        page.locator("[data-classic-text] > p").first(),
      ).toBeVisible();
    }
  }
});

async function observeSceneMovement(
  page: Page,
  sceneId: string,
  direction: "forward" | "backward",
) {
  await page.evaluate(
    ({ sceneId, direction }) => {
      const html = document.documentElement;
      delete html.dataset.checkedSceneMotion;
      const mobile = matchMedia("(max-width: 1024px)").matches;
      function sample() {
        const reader = document.querySelector(".fs-reader");
        const title = document.getElementById(sceneId);
        const image = mobile
          ? title?.parentElement?.querySelector(
              ".fs-reader-mobile-image > .fs-asset",
            )
          : reader?.querySelector('[data-scene-layer="current"]');
        const caption = mobile
          ? title
          : reader?.querySelector(".fs-reader-stage-caption");
        if (
          reader?.getAttribute("data-active-scene") !== sceneId ||
          !image ||
          !caption
        ) {
          requestAnimationFrame(sample);
          return;
        }
        const slide = image
          .getAnimations()
          .find((a) => a.playState === "running");
        const captionTime = caption
          .getAnimations()
          .find((a) => a.playState === "running")?.currentTime;
        const pictureTime = slide?.currentTime;
        const start =
          slide?.effect instanceof KeyframeEffect
            ? slide.effect.getKeyframes()[0]?.transform
            : null;
        const prefix =
          direction === "forward" ? /translateX\([1-9]/ : /translateX\(-[1-9]/;
        if (
          typeof start === "string" &&
          prefix.test(start) &&
          typeof pictureTime === "number" &&
          typeof captionTime === "number" &&
          pictureTime > 0 &&
          pictureTime < 400 &&
          Math.abs(pictureTime - captionTime) <= 17
        ) {
          const number = document.querySelector(".fs-scene-count")?.textContent;
          const bounds = image.getBoundingClientRect();
          const toolbarBottom = document
            .querySelector(".fs-reading-toolbar")!
            .getBoundingClientRect().bottom;
          html.dataset.checkedSceneMotion = number + " " + caption.textContent;
          html.dataset.visibleSlideArt = String(
            Math.max(
              0,
              Math.min(bounds.bottom, innerHeight) -
                Math.max(bounds.top, toolbarBottom),
            ),
          );
          return;
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    },
    { sceneId, direction },
  );
}

for (const story of stories) {
  test(`${story.title} slides the artwork, title and number across every scene boundary`, async ({
    page,
  }) => {
    const compact = page.viewportSize()!.width <= 640;
    if (compact) await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/read/" + story.id);
    const reader = page.locator(".fs-reader");
    await expect(reader).toHaveAttribute(
      "data-active-scene",
      story.scenes[0]!.id,
    );
    await expect(reader).toHaveAttribute("data-motion", "full");
    await expect(reader).toHaveClass(/fs-reader-cinematic/);

    async function cross(fromIndex: number, toIndex: number) {
      const from = story.scenes[fromIndex]!;
      const to = story.scenes[toIndex]!;
      const forward = fromIndex < toIndex;
      await scrollToBeat(
        page,
        (forward ? from.beats.at(-1) : from.beats[0])!.id,
      );
      if (compact && !forward) {
        await scrollToBeat(page, to.beats.at(-1)!.id);
        await expect(page.locator(".fs-scene-count")).toHaveText(
          toIndex + 1 + "/6",
        );
        const artwork = page.locator(
          `[aria-labelledby="${to.id}"] .fs-reader-mobile-image > picture`,
        );
        expect(
          await artwork.evaluate((element) => element.getAnimations().length),
        ).toBe(0);
        return;
      }
      if (compact) {
        await page
          .locator(
            `[aria-labelledby="${to.id}"] .fs-reader-mobile-image > picture img`,
          )
          .evaluate((image) => (image as HTMLImageElement).decode());
      }
      await observeSceneMovement(page, to.id, forward ? "forward" : "backward");
      await scrollToBeat(page, (forward ? to.beats[0] : to.beats.at(-1))!.id);
      await expect(page.locator("html")).toHaveAttribute(
        "data-checked-scene-motion",
        toIndex + 1 + "/6 " + String(toIndex + 1).padStart(2, "0") + to.title,
      );
      expect(
        Number(
          await page.locator("html").getAttribute("data-visible-slide-art"),
        ),
      ).toBeGreaterThan(50);
    }
    for (let index = 1; index < story.scenes.length; index++)
      await cross(index - 1, index);
    for (let index = story.scenes.length - 1; index > 0; index--)
      await cross(index, index - 1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
}

test("reduced motion keeps cover navigation and the next scene immediate", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/discover?status=ready");
  const classic = page.getByRole("link", {
    name: "동백꽃, 김유정 작품 소개",
    exact: true,
  });
  await observeCoverMovement(page, classicCover);
  await classic.click();
  await expect(page).toHaveURL(/\/stories\/classic-camellias$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "동백꽃" }),
  ).toBeVisible();
  expect(
    await page.locator("html").getAttribute("data-checked-cover-motion"),
  ).toBeNull();

  await page.goto("/read/tide-station");
  await expect(page.locator(".reader-page")).toHaveAttribute(
    "data-reader-ready",
    "true",
  );
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-motion",
    "reduced",
  );
  await enterSecondScene(page);
  expect(
    await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter(
            ({ effect }) =>
              effect instanceof KeyframeEffect &&
              effect.target instanceof Element &&
              effect.target.closest(".fs-reader") !== null,
          ).length,
    ),
  ).toBe(0);
  await expect(page.locator("#tide-s02-b01")).toBeVisible();
});
