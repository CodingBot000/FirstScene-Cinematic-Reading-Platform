import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

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

test("scrolling into the second station scene moves its image and caption together", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/read/tide-station");
  const reader = page.locator(".fs-reader");
  await expect(reader).toHaveAttribute("data-active-scene", "tide-s01");
  await expect(reader).toHaveAttribute("data-motion", "full");
  await expect(reader).toHaveClass(/fs-reader-cinematic/);
  await scrollToBeat(page, "tide-s01-b06");

  await page.evaluate(() => {
    function sample() {
      const mobile = matchMedia("(max-width: 1024px)").matches;
      const image = document.querySelector(
        mobile
          ? '[aria-labelledby="tide-s02"] .fs-reader-mobile-image .fs-asset'
          : '[data-scene-layer="current"]',
      );
      const caption = document.querySelector(
        mobile ? "#tide-s02" : ".fs-reader-stage-caption",
      );
      const pictureTime = image
        ?.getAnimations()
        .find((a) => a.playState === "running")?.currentTime;
      const captionTime = caption
        ?.getAnimations()
        .find((a) => a.playState === "running")?.currentTime;
      if (
        typeof pictureTime === "number" &&
        typeof captionTime === "number" &&
        pictureTime > 0 &&
        pictureTime < 400 &&
        Math.abs(pictureTime - captionTime) <= 17
      ) {
        const number = document.querySelector(".fs-scene-count")?.textContent;
        const title = caption?.textContent;
        document.documentElement.dataset.checkedSceneMotion =
          number + " " + title;
        return;
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await enterSecondScene(page);
  await expect(page.locator("html")).toHaveAttribute(
    "data-checked-scene-motion",
    /2\/6 02\s*회수되지 않은 표/,
  );
  await expect(page.locator("#tide-s02-b01")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});

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
