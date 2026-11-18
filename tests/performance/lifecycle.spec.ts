import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { installLifecycleProbe, lifecycleSnapshot } from "./probes";
test("twenty real renderer mounts remove listeners, observers and actual GSAP timeline children", async ({
  page,
}, testInfo) => {
  await installLifecycleProbe(page);
  await page.goto(
    "http://127.0.0.1:6006/iframe.html?id=firstscene-verification--lifecycle&viewMode=story",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { firstsceneLifecycle?: { version: string } })
            .firstsceneLifecycle?.version,
      ),
    )
    .toBe("3.15.1");
  const tweens = () =>
    page.evaluate(() =>
      (
        window as unknown as { firstsceneLifecycle: { tweens: () => number } }
      ).firstsceneLifecycle.tweens(),
    );
  async function mountAndAnimate() {
    await page
      .getByRole("button", { name: "검사 대상 마운트", exact: true })
      .click();
    await expect(page.locator(".fs-reader")).toHaveCount(1);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    await page.locator("#mail-s03-b02").evaluate((element) => {
      const r = element.getBoundingClientRect();
      scrollTo({
        top: scrollY + r.top + r.height * 0.3 - innerHeight * 0.42,
        behavior: "instant",
      });
    });
    await expect(page.locator(".fs-reader")).toHaveAttribute(
      "data-active-scene",
      "mail-s03",
    );
    await expect.poll(tweens).toBeGreaterThan(0);
    return tweens();
  }
  async function unmount() {
    await page
      .getByRole("button", { name: "검사 대상 제거", exact: true })
      .click();
    await expect(page.locator(".fs-reader")).toHaveCount(0);
    await expect.poll(tweens).toBe(0);
  }
  await mountAndAnimate();
  await unmount(); // Warm framework/plugin initialization before measuring accumulation.
  const baseline = await lifecycleSnapshot(page);
  const samples = [];
  for (let cycle = 1; cycle <= 20; cycle++) {
    const activeTweens = await mountAndAnimate();
    await unmount();
    await expect.poll(() => lifecycleSnapshot(page)).toEqual(baseline);
    samples.push({
      cycle,
      activeTweensBeforeUnmount: activeTweens,
      after: await lifecycleSnapshot(page),
      timelineChildrenAfter: await tweens(),
    });
  }
  fs.mkdirSync("evidence/performance/current", { recursive: true });
  fs.writeFileSync(
    `evidence/performance/current/lifecycle-${testInfo.project.name}.json`,
    JSON.stringify(
      {
        status: "PASS",
        observedAt: new Date().toISOString(),
        browser: testInfo.project.name,
        scope:
          "actual shared renderer in developer-only Storybook fixture; no product debug hook",
        measuredCycles: 20,
        warmupCycles: 1,
        onceListenersExcluded: true,
        baseline,
        samples,
      },
      null,
      2,
    ) + "\n",
  );
});
