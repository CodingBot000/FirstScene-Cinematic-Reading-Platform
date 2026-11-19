import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import { createHash } from "node:crypto";
export const directory = "evidence/visual/current";
export async function geometry(page: Page) {
  const result = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
    horizontalOverflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    h1: document.querySelectorAll("h1").length,
    main: document.querySelectorAll("main").length,
  }));
  expect(result.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(result.h1).toBe(1);
  expect(result.main).toBe(1);
  const summaries = await page
    .locator(".fs-story-info p")
    .evaluateAll((paragraphs) =>
      paragraphs.map((paragraph) => ({
        height: paragraph.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(paragraph).lineHeight),
      })),
    );
  for (const summary of summaries)
    expect(summary.height).toBeLessThanOrEqual(summary.lineHeight * 2 + 1);
  return result;
}
export async function axe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  return {
    violations: result.violations.length,
    passes: result.passes.length,
    incomplete: result.incomplete.length,
  };
}
export async function capture(
  page: Page,
  name: string,
  mode: string,
  state: string,
  fullPage = false,
) {
  await page.evaluate(() => document.fonts.ready);
  const layout = await geometry(page);
  const engine = test.info().project.name.includes("webkit") ? "-webkit" : "";
  const path = `${directory}/${name}-${layout.width}x${layout.height}-${mode}-${state}${engine}.png`;
  await page.screenshot({ path, fullPage });
  const file = `${directory}/captures.json`;
  const entries = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : [];
  entries.push({
    path,
    name,
    mode,
    state,
    layout,
    sha256: createHash("sha256").update(fs.readFileSync(path)).digest("hex"),
    opened: false,
  });
  fs.writeFileSync(file, JSON.stringify(entries, null, 2) + "\n");
}
export async function settlePublicImages(page: Page) {
  // Full-page captures include images below the fold. Force native lazy
  // images to fetch without artificially changing the user's product code.
  await page.locator("img").evaluateAll((images) => {
    for (const image of images) (image as HTMLImageElement).loading = "eager";
  });
  await expect
    .poll(() =>
      page
        .locator("img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
}
export async function saved(page: Page) {
  // Progress debounce is750ms. Require a stable acknowledged state so a later
  // anchor/layout write cannot turn an online screenshot into a transient frame.
  let stableSince = 0;
  await expect
    .poll(
      async () => {
        const text = await page.locator(".fs-save-status").textContent();
        if (text !== "서버에 저장됨") {
          stableSince = 0;
          return 0;
        }
        stableSince ||= Date.now();
        return Date.now() - stableSince;
      },
      { timeout: 10000, intervals: [100] },
    )
    .toBeGreaterThanOrEqual(800);
}
export async function readerReady(page: Page) {
  await expect(page.locator("[data-reader-ready]")).toHaveAttribute(
    "data-reader-ready",
    "true",
  );
  await saved(page);
  await expect(page.locator(".fs-effect-clone")).toHaveCount(0);
}
export async function toolbar(page: Page) {
  const controls = await page
    .locator(".fs-reading-toolbar button")
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const r = button.getBoundingClientRect();
        return {
          width: r.width,
          height: r.height,
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
        };
      }),
    );
  expect(controls.length).toBe(3);
  for (const r of controls) {
    expect(r.width).toBeGreaterThanOrEqual(44);
    expect(r.height).toBeGreaterThanOrEqual(44);
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.right).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
}
