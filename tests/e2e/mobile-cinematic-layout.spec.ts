import { expect, test } from "@playwright/test";

const responsiveWidths = [320, 360, 390, 430, 768, 900, 1023];

test("each narrow-screen scene pairs its own art, text, and working destination", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const width of responsiveWidths) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");

    const root = page.locator(".cinematic-prologue");
    await expect(root).toHaveAttribute("data-scroll-mode", "static");
    const scenes = root.locator(".cinematic-scene");
    await expect(scenes).toHaveCount(3);
    await expect(page.locator(".pin-spacer")).toHaveCount(0);

    const layout = await scenes.evaluateAll((elements) =>
      elements.map((element) => {
        const copy = element.querySelector(".cinematic-beat")!;
        const artwork = element.querySelector(".cinematic-visual")!;
        const text = copy.getBoundingClientRect();
        const image = artwork.getBoundingClientRect();
        return {
          sceneId: element.getAttribute("data-cinematic-scene"),
          imageCount: artwork.querySelectorAll("img").length,
          links: Array.from(copy.querySelectorAll<HTMLAnchorElement>("a")).map(
            (link) => link.getAttribute("href"),
          ),
          text: {
            top: text.top,
            bottom: text.bottom,
            left: text.left,
            right: text.right,
          },
          image: {
            top: image.top,
            bottom: image.bottom,
            left: image.left,
            right: image.right,
          },
        };
      }),
    );
    expect(layout.map((scene) => scene.links[0])).toEqual([
      "/read/post-office",
      "/read/tide-station",
      "/discover",
    ]);

    for (const scene of layout) {
      expect(scene.imageCount).toBeGreaterThan(0);
      expect(scene.image.top).toBeLessThan(scene.text.bottom);
      expect(scene.image.bottom).toBeGreaterThan(scene.text.top);
      expect(
        scene.text.right <= scene.image.left + 1 ||
          scene.image.right <= scene.text.left + 1,
      ).toBe(true);
    }

    const browser = await page.evaluate(() => ({
      viewport: innerWidth,
      scroll: document.documentElement.scrollWidth,
      settings: document
        .querySelector<HTMLElement>(".site-header nav a[href='/settings']")!
        .getBoundingClientRect().right,
    }));
    expect(browser.scroll).toBeLessThanOrEqual(browser.viewport + 1);
    expect(browser.settings).toBeLessThanOrEqual(browser.viewport + 1);

    if (width === 390) {
      await page.screenshot({
        path: "evidence/ui/mobile-cinematic-scenes-390.png",
        fullPage: false,
      });
    }
  }
});

test("switching from desktop pin to mobile removes stale scroll styles", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const root = page.locator(".cinematic-prologue");
  await expect(root).toHaveAttribute("data-scroll-mode", "pinned", {
    timeout: 12000,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(root).toHaveAttribute("data-scroll-mode", "static");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(root.locator(".cinematic-scene")).toHaveCount(3);
  for (const scene of await root.locator(".cinematic-scene").all()) {
    await expect(scene).toBeVisible();
    await expect(scene.locator(".cinematic-visual")).toBeVisible();
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("mobile stories retain semantic pairing and destinations", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const scenes = page.locator(".cinematic-scene");
    await expect(scenes).toHaveCount(3);
    await expect(scenes.nth(0).locator("h1")).toContainText("장면에 머물다");
    await expect(scenes.nth(1).locator("h2")).toContainText("도착하는 이야기");
    await expect(scenes.nth(2).locator("h2")).toContainText("서른네 개의 세계");
    await expect(
      scenes.nth(1).getByRole("link", { name: /두 번째 이야기 읽기/ }),
    ).toHaveAttribute("href", "/read/tide-station");
  });
});
