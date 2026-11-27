import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
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

async function observeCoverTransitions(page: Page) {
  await page.addInitScript(() => {
    const start = document.startViewTransition;
    if (!start) return;
    document.startViewTransition = function (
      this: Document,
      ...args: Parameters<typeof start>
    ) {
      const transition = Reflect.apply(start, this, args);
      // Inspect the native snapshots when they exist, before the engine removes them.
      void transition.ready.then(
        () => {
          for (const animation of document.getAnimations()) {
            const effect = animation.effect;
            if (!(effect instanceof KeyframeEffect)) continue;
            const name = effect.pseudoElement ?? "";
            const group =
              /^::view-transition-group\((cover-[a-z0-9-]+)\)$/.exec(name);
            if (group && Number(effect.getTiming().duration) > 0) {
              document.documentElement.dataset.checkedCoverMotion = group[1];
            }
            const opening =
              /^::view-transition-new\(cover-([a-z0-9-]+)\)$/.exec(name);
            if (
              opening &&
              animation instanceof CSSAnimation &&
              animation.animationName === "story-open-art" &&
              Number(effect.getTiming().duration) > 0
            ) {
              document.documentElement.dataset.checkedOpening = opening[1];
            }
          }
        },
        () => {},
      );
      return transition;
    };
  });
}

async function prepareStoryLink(
  page: Page,
  source: string,
  destination: string,
  link: Locator,
) {
  // Next's pinned App Router sends full RSC prefetches without a shell header.
  const prefetch = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === destination &&
      response.ok() &&
      response.request().headers().rsc === "1" &&
      !response.request().headers()["next-router-prefetch"],
  );
  await page.goto(source);
  await link.scrollIntoViewIfNeeded();
  expect(await (await prefetch).finished()).toBeNull();
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
  await observeCoverTransitions(page);
  const classic = page.getByRole("link", {
    name: "동백꽃, 김유정 작품 소개",
    exact: true,
  });
  await prepareStoryLink(
    page,
    "/discover?status=ready",
    "/stories/classic-camellias",
    classic,
  );
  await classic
    .locator("img")
    .evaluate((image) => (image as HTMLImageElement).decode());
  await classic.click();
  await expect(page).toHaveURL(/\/stories\/classic-camellias$/);
  await expect(page.locator("html")).toHaveAttribute(
    "data-checked-cover-motion",
    classicCover,
  );
  await expect(page.getByRole("img", { name: "동백꽃 표지" })).toBeVisible();

  const original = page.getByRole("link", {
    name: "수심 없는 역의 오리지널 표지",
    exact: true,
  });
  await prepareStoryLink(
    page,
    "/discover?status=ready",
    "/stories/tide-station",
    original,
  );
  await original
    .locator("img")
    .evaluate((image) => (image as HTMLImageElement).decode());
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
  await observeCoverTransitions(page);
  for (const [id, name, button] of [
    ["post-office", "빛을 접어 보내는 우체국", "첫 장면 읽기"],
    ["tide-station", "수심 없는 역", "첫 장면 읽기"],
    ["classic-camellias", "동백꽃", "처음부터 읽기"],
  ]) {
    const read = page.getByRole("link", { name: button, exact: true });
    await prepareStoryLink(page, "/stories/" + id, "/read/" + id, read);
    const detailCover = page.locator(".detail-cover img");
    await detailCover.evaluate((image) => (image as HTMLImageElement).decode());
    await expect(detailCover).toBeInViewport();
    await read.click();
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

test.describe("cover links without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("catalog and introduction offer ordinary keyboard routes to readable content", async ({
    page,
  }) => {
    await page.goto("/discover?status=ready");
    const cover = page.getByRole("link", {
      name: "동백꽃, 김유정 작품 소개",
      exact: true,
    });
    await cover.focus();
    await expect(cover).toBeFocused();
    await cover.press("Enter");
    await expect(page).toHaveURL(/\/stories\/classic-camellias$/);
    await expect(page.getByRole("img", { name: "동백꽃 표지" })).toBeVisible();
    const read = page.getByRole("link", {
      name: "처음부터 읽기",
      exact: true,
    });
    await read.focus();
    await expect(read).toBeFocused();
    await read.press("Enter");
    await expect(page).toHaveURL(/\/read\/classic-camellias$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "동백꽃" }),
    ).toBeVisible();
    await expect(page.locator("[data-classic-text] > p").first()).toBeVisible();
    await page.goBack();
    await expect(read).toBeVisible();
  });
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
  await observeCoverTransitions(page);
  await page.goto("/discover?status=ready");
  const classic = page.getByRole("link", {
    name: "동백꽃, 김유정 작품 소개",
    exact: true,
  });
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
