import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const manifest = JSON.parse(
  readFileSync("content/generated/assets.json", "utf8"),
);
const classicManifest = JSON.parse(
  readFileSync("content/generated/classic-cover-assets.json", "utf8"),
);
test("P02 actual public assets are16approved and bothformats serve correctMIME", async ({
  request,
}) => {
  expect(manifest.assets).toHaveLength(16);
  for (const asset of manifest.assets) {
    expect(asset.review.status).toBe("approved");
    for (const format of ["avif", "webp"]) {
      const variant = asset.variants.find(
        (v: { format: string; width: number }) =>
          v.format === format &&
          v.width === (asset.role === "background" ? 480 : 320),
      );
      const response = await request.get(variant.path);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/" + format);
      expect(response.headers()["cache-control"]).toContain("immutable");
    }
  }
});
test("P02 mobile portrait scene keeps a stable anchor rather than oscillating afterimage/portraitmount", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/read/post-office#mail-s02-b01");
  await expect(page.locator("[data-reader-ready]")).toHaveAttribute(
    "data-reader-ready",
    "true",
  );
  const states = await page.evaluate(async () => {
    const values: string[] = [];
    for (let i = 0; i < 30; i++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      values.push(
        document
          .querySelector(".fs-reader")
          ?.getAttribute("data-active-beat") ?? "",
      );
    }
    return values;
  });
  expect(Array.from(new Set(states.slice(-10)))).toEqual(["mail-s02-b01"]);
  await page.screenshot({
    path: "evidence/assets/mobile-portrait-current.png",
    fullPage: false,
  });
});

test("AS-01 classic cover requests match the card, introduction and reader slots", async ({
  browser,
  baseURL,
  request,
}) => {
  const asset = classicManifest.assets.find(
    ({ id }: { id: string }) => id === "classic-camellias",
  );
  for (const [route, selector, maxWidth] of [
    [
      "/discover?status=ready",
      '.classic-card[href="/stories/classic-camellias"] img',
      320,
    ],
    ["/stories/classic-camellias", ".detail-cover img", 480],
    ["/read/classic-camellias", ".classic-reading-cover img", 144],
  ] as const) {
    // A browser can reuse a larger cached candidate after the introduction.
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
    });
    let currentPath: string;
    try {
      const page = await context.newPage();
      await page.goto(route);
      const image = page.locator(selector);
      await image.scrollIntoViewIfNeeded();
      currentPath = await image.evaluate(async (img: HTMLImageElement) => {
        await img.decode();
        return new URL(img.currentSrc).pathname;
      });
    } finally {
      await context.close();
    }
    const variant = asset.variants.find(
      ({ path }: { path: string }) => path === currentPath,
    );
    expect(variant?.width).toBeLessThanOrEqual(maxWidth);
    expect(variant.bytes).toBeLessThan(asset.source.bytes);
    const response = await request.get(currentPath);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain(
      "image/" + variant.format,
    );
    expect(response.headers()["cache-control"]).toContain("immutable");
  }
});

test("AS-03 classic introduction renders WebP without AVIF or JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  try {
    const page = await context.newPage();
    await page.route("**/stories/classic-camellias", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()).replaceAll(
          'type="image/avif"',
          'type="image/x-unsupported"',
        ),
      });
    });
    await page.goto("/stories/classic-camellias");
    const image = page.locator(".detail-cover img");
    expect(
      await image.evaluate(async (img: HTMLImageElement) => {
        await img.decode();
        return img.currentSrc;
      }),
    ).toMatch(/\.webp$/);
    await page.getByRole("link", { name: "처음부터 읽기" }).click();
    await expect(page.locator("[data-classic-text] p").first()).toBeVisible();
  } finally {
    await context.close();
  }
});

test("AS-06 a missing classic cover leaves the title, layout and reading link usable", async ({
  page,
  request,
}) => {
  const missing = await request.get("/assets/unversioned.webp");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["cache-control"] ?? "").not.toContain("immutable");
  await page.route("**/assets/classics/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.goto("/stories/classic-camellias");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const cover = page.locator(".detail-cover picture");
  await expect(cover).toBeVisible();
  const rect = await cover.boundingBox();
  expect(rect!.width / rect!.height).toBeCloseTo(3 / 4, 2);
  await page.getByRole("link", { name: "처음부터 읽기" }).click();
  await expect(page.locator("[data-classic-text] p").first()).toBeVisible();
});
