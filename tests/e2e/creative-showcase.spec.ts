import { expect, test } from "@playwright/test";

test("desktop shader is optional and owns its GPU lifecycle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const root = page.locator(".cinematic-prologue");
  const canvas = root.locator(".cinematic-webgl-canvas");
  await expect(canvas).toHaveCount(1);
  await expect(root).toHaveAttribute("data-scroll-mode", "pinned", {
    timeout: 12000,
  });
  await expect(canvas).toHaveAttribute("data-renderer", /^(webgl2|fallback)$/, {
    timeout: 12000,
  });
  const webglSupported = await page.evaluate(() => {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2"));
  });
  if (webglSupported) {
    // Detect shader/link errors rather than reporting fallback as a GPU pass.
    await expect(canvas).toHaveAttribute("data-renderer", "webgl2");
  }
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "문장을 읽고",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(root).toHaveAttribute("data-scroll-mode", "static");
  await expect(canvas).toHaveAttribute("data-renderer", "inactive");
  await expect(canvas).toBeHidden();
  await expect(root.locator(".cinematic-scene")).toHaveCount(3);
});

test("WebGL2 unavailable leaves the ordinary covers, reader links and scroll controls", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const base = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: function (
        this: HTMLCanvasElement,
        type: string,
        ...args: unknown[]
      ) {
        if (type === "webgl2") return null;
        return Reflect.apply(base, this, [type, ...args]);
      },
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const root = page.locator(".cinematic-prologue");
  await expect(root).toHaveAttribute("data-scroll-mode", "pinned", {
    timeout: 12000,
  });
  await expect(root.locator(".cinematic-webgl-canvas")).toHaveAttribute(
    "data-renderer",
    "fallback",
    { timeout: 12000 },
  );
  await expect(
    root.getByRole("link", { name: /첫 장면 바로 읽기/ }),
  ).toHaveAttribute("href", "/read/post-office");
  await expect(root.locator(".cinematic-scene")).toHaveCount(3);
});

test("reduced-motion receives readable semantic scenes without a GPU animation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".cinematic-webgl-canvas")).toBeHidden();
  await expect(page.locator(".cinematic-webgl-canvas")).toHaveAttribute(
    "data-renderer",
    "inactive",
  );
  await expect(page.locator(".cinematic-scene")).toHaveCount(3);
  await expect(page.locator(".cinematic-scene-action")).toHaveCount(3);
});

test("catalog state changes preserve titles, links and accessibility with Flip enabled", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/discover");
  await expect(page.locator("[data-flip-id]")).toHaveCount(56);
  await page.getByRole("radio", { name: "미스터리 · 도시" }).check();
  await expect(page.locator("[data-flip-id]")).toHaveCount(7);
  await expect(page.getByRole("status")).toContainText("7편의 이야기");
  await page.getByRole("radio", { name: /지금 읽기 22/ }).check();
  await expect(page.locator("[data-flip-id]")).toHaveCount(22);
  await expect(page.getByRole("status")).toContainText("22편의 이야기");
  await expect(
    page.locator(".discovery-finished-card a[href^='/stories/']"),
  ).toHaveCount(6);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("Flip cleanup restores responsive grid when viewport or motion settings change mid-transition", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/discover");

  // The plugin is lazy. Exercise a real filter after the import has settled.
  await page.getByRole("radio", { name: "미스터리 · 도시" }).check();
  await expect(page.locator("[data-flip-id]")).toHaveCount(7);
  await page.getByRole("radio", { name: "모든 장르" }).check();

  // Resize while the cards are still returning to their original positions.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("[data-flip-id]")).toHaveCount(36);
  await expect
    .poll(() =>
      page
        .locator("[data-flip-id]")
        .evaluateAll((elements) =>
          elements.every(
            (element) =>
              getComputedStyle(element).position !== "absolute" &&
              element.style.position !== "absolute",
          ),
        ),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);

  // Turning on reduced motion also must leave readable CSS-grid items.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("radio", { name: "미스터리 · 도시" }).check();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      page
        .locator("[data-flip-id]")
        .evaluateAll((elements) =>
          elements.every(
            (element) => getComputedStyle(element).position !== "absolute",
          ),
        ),
    )
    .toBe(true);
  await expect(page.getByRole("status")).toContainText("7편의 이야기");
});
