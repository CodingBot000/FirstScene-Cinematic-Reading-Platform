import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    readPortalFrames: () => { draws: number; queued: number; peak: number };
    setPortalPageHidden: (hidden: boolean) => void;
  }
}

test("GPU-02 the portal keeps one frame queued while visible and none offscreen or hidden", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const pending = new Map<number, FrameRequestCallback>();
    let executing: FrameRequestCallback | undefined;
    let portalLoop: FrameRequestCallback | undefined;
    let draws = 0;
    let peak = 0;
    let hidden = false;
    const queued = () =>
      portalLoop
        ? [...pending.values()].filter((callback) => callback === portalLoop)
            .length
        : 0;
    window.requestAnimationFrame = (callback) => {
      const id = request((now) => {
        pending.delete(id);
        executing = callback;
        try {
          callback(now);
        } finally {
          executing = undefined;
        }
      });
      pending.set(id, callback);
      if (callback === portalLoop) peak = Math.max(peak, queued());
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      pending.delete(id);
      cancel(id);
    };
    const prototype = window.WebGL2RenderingContext?.prototype;
    if (prototype) {
      const draw = prototype.drawArrays;
      prototype.drawArrays = function (...args) {
        if (
          this.canvas instanceof HTMLCanvasElement &&
          this.canvas.classList.contains("cinematic-webgl-canvas")
        ) {
          portalLoop = executing;
          draws++;
        }
        return draw.apply(this, args);
      };
    }
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
    window.setPortalPageHidden = (next) => {
      hidden = next;
      document.dispatchEvent(new Event("visibilitychange"));
    };
    window.readPortalFrames = () => ({ draws, queued: queued(), peak });
  });
  await page.goto("/");
  const canvas = page.locator(".cinematic-webgl-canvas");
  await expect(canvas).toHaveAttribute("data-renderer", /^(webgl2|fallback)$/);
  if ((await canvas.getAttribute("data-renderer")) === "fallback") {
    // On hosts with no context, verify the published static fallback.
    expect(
      await page.evaluate(() =>
        Boolean(document.createElement("canvas").getContext("webgl2")),
      ),
    ).toBe(false);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    return;
  }
  const frames = () => page.evaluate(() => window.readPortalFrames());
  await expect.poll(async () => (await frames()).draws).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(() =>
      canvas.evaluate((element) => element.getBoundingClientRect().bottom),
    )
    .toBeLessThan(0);
  await expect.poll(async () => (await frames()).queued).toBe(0);
  const offscreen = (await frames()).draws;
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(async () => (await frames()).draws)
    .toBeGreaterThan(offscreen);
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.setPortalPageHidden(true));
    const paused = await frames();
    expect(paused.queued).toBe(0);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    expect((await frames()).draws).toBe(paused.draws);
    await page.evaluate(() => window.setPortalPageHidden(false));
    await expect
      .poll(async () => (await frames()).draws)
      .toBeGreaterThan(paused.draws);
  }
  expect((await frames()).peak).toBe(1);

  const canLoseContext = await canvas.evaluate((element: HTMLCanvasElement) => {
    const extension = element
      .getContext("webgl2")
      ?.getExtension("WEBGL_lose_context");
    extension?.loseContext();
    return Boolean(extension);
  });
  if (canLoseContext) {
    await expect(canvas).toHaveAttribute("data-renderer", "fallback");
    expect((await frames()).queued).toBe(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

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
  await expect(page.locator("[data-flip-id]")).toHaveCount(56);
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
