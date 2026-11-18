import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const manifest = JSON.parse(
  readFileSync("content/generated/assets.json", "utf8"),
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
