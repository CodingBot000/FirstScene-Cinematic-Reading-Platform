import { test, expect } from "@playwright/test";
import fs from "node:fs";
type Timing = {
  name: string;
  startTime: number;
  duration: number;
  processingStart: number;
  processingEnd: number;
  interactionId: number;
};
type Paint = { label: string; type: string; delay: number };
type Probe = {
  label: string | null;
  events: Timing[];
  paints: Paint[];
  tasks: { startTime: number; duration: number }[];
  eventObserver: PerformanceObserver;
  taskObserver: PerformanceObserver;
};
declare global {
  interface Window {
    firstscenePerf: Probe;
  }
}
test("production controls expose lab Event Timing and animation avoids repeated long tasks at4xCPU", async ({
  page,
  context,
}) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    const events: Timing[] = [],
      paints: Paint[] = [],
      tasks: { startTime: number; duration: number }[] = [];
    const eventObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const event = entry as PerformanceEventTiming;
        events.push({
          name: event.name,
          startTime: event.startTime,
          duration: event.duration,
          processingStart: event.processingStart,
          processingEnd: event.processingEnd,
          interactionId: event.interactionId,
        });
      }
    });
    eventObserver.observe({
      type: "event",
      buffered: true,
      durationThreshold: 16,
    });
    const taskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        tasks.push({ startTime: entry.startTime, duration: entry.duration });
    });
    taskObserver.observe({ type: "longtask", buffered: true });
    window.firstscenePerf = {
      label: null,
      events,
      paints,
      tasks,
      eventObserver,
      taskObserver,
    };
    for (const name of ["click", "keydown"])
      window.addEventListener(
        name,
        (event) => {
          const label = window.firstscenePerf.label;
          if (!label || !event.isTrusted) return;
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              paints.push({
                label,
                type: event.type,
                delay: performance.now() - event.timeStamp,
              }),
            ),
          );
        },
        true,
      );
  });
  await page.goto("/read/post-office");
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  const samples: unknown[] = [];
  async function measure(label: string, action: () => Promise<void>) {
    const from = await page.evaluate((label) => {
      window.firstscenePerf.label = label;
      return performance.now();
    }, label);
    await action();
    const sample = await page.evaluate(
      async ({ label, from }) => {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
        );
        const probe = window.firstscenePerf;
        for (const entry of probe.eventObserver.takeRecords()) {
          const event = entry as PerformanceEventTiming;
          probe.events.push({
            name: event.name,
            startTime: event.startTime,
            duration: event.duration,
            processingStart: event.processingStart,
            processingEnd: event.processingEnd,
            interactionId: event.interactionId,
          });
        }
        const to = performance.now();
        probe.label = null;
        return {
          label,
          from,
          to,
          eventTiming: probe.events.filter(
            (e) => e.startTime >= from && e.startTime <= to,
          ),
          nextPaintProxy: probe.paints.filter((p) => p.label === label),
          visibility: document.visibilityState,
        };
      },
      { label, from },
    );
    samples.push(sample);
    fs.mkdirSync("evidence/performance/current", { recursive: true });
    fs.writeFileSync(
      "evidence/performance/current/interactions.json",
      JSON.stringify(
        {
          status: "IN_PROGRESS",
          observedAt: new Date().toISOString(),
          samples,
        },
        null,
        2,
      ) + "\n",
    );
    expect(sample.visibility).toBe("visible");
    expect(sample.nextPaintProxy.length).toBeGreaterThan(0);
    expect(
      Math.max(...sample.nextPaintProxy.map((p) => p.delay)),
    ).toBeLessThanOrEqual(200);
    for (const event of sample.eventTiming)
      expect(event.duration).toBeLessThanOrEqual(200);
  }
  await measure("toolbar-settings", async () => {
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
  await measure("mode-plain", async () => {
    await page.getByRole("radio", { name: "일반 읽기", exact: true }).check();
    await expect(page.locator(".fs-reader")).toHaveClass(/fs-reader-plain/);
  });
  await measure("close-settings", async () => {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
  await measure("bookmark", async () => {
    await page
      .locator("#mail-s01-b01")
      .locator("..")
      .getByRole("button", { name: "이 문장 저장", exact: true })
      .click();
    await expect(
      page
        .locator("#mail-s01-b01")
        .locator("..")
        .getByRole("button", { name: "이 문장 저장 해제", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByRole("radio", { name: "연출 읽기", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(page.locator(".fs-reader")).toHaveClass(/fs-reader-cinematic/);
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  const animationFrom = await page.evaluate(() => performance.now());
  for (const id of [
    "mail-s02-b02",
    "mail-s03-b03",
    "mail-s05-b03",
    "mail-s06-b03",
    "mail-s03-b02",
    "mail-s01-b02",
  ]) {
    await page.locator("#" + id).evaluate((element) => {
      const r = element.getBoundingClientRect();
      scrollTo({
        top: scrollY + r.top + r.height * 0.3 - innerHeight * 0.42,
        behavior: "instant",
      });
    });
    await expect(page.locator(".fs-reader")).toHaveAttribute(
      "data-active-beat",
      id,
    );
  }
  const animation = await page.evaluate(async (from) => {
    // Observe the actual slide and the main-thread tail after rapid jumps.
    const tailStart = performance.now();
    const current = document.querySelector<HTMLElement>(
      '[data-scene-layer="current"]',
    )!;
    const layerWidth = current.getBoundingClientRect().width;
    const frames: { time: number; offsetX: number }[] = [];
    await new Promise<void>((resolve) =>
      requestAnimationFrame(function sample(now) {
        const transform = getComputedStyle(current).transform;
        frames.push({
          time: now,
          offsetX:
            transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m41,
        });
        if (now - tailStart >= 2000) resolve();
        else requestAnimationFrame(sample);
      }),
    );
    const probe = window.firstscenePerf;
    for (const entry of probe.taskObserver.takeRecords())
      probe.tasks.push({
        startTime: entry.startTime,
        duration: entry.duration,
      });
    return {
      from,
      to: performance.now(),
      frameCount: frames.length,
      intermediateSlideFrames: frames.filter(
        ({ offsetX }) =>
          Math.abs(offsetX) > 0.5 && Math.abs(offsetX) < layerWidth - 0.5,
      ).length,
      firstFrames: frames.slice(0, 20),
      longTasks: probe.tasks.filter(
        (entry) => entry.startTime >= from && entry.duration > 50,
      ),
    };
  }, animationFrom);
  fs.mkdirSync("evidence/performance/current", { recursive: true });
  fs.writeFileSync(
    "evidence/performance/current/interactions.json",
    JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        status: "COLLECTED",
        environment: {
          cpuSlowdown: 4,
          network:
            "local unthrottled; navigation profile is measured separately",
          browser: "Chromium",
          viewport: page.viewportSize(),
        },
        terminology:
          "lab interaction latency; Event Timing rounded/min16ms; nextPaintProxy is trusted event to two rAF callbacks, not INP or field data",
        samples,
        animation,
      },
      null,
      2,
    ) + "\n",
  );
  expect(animation.longTasks.length).toBeLessThan(2);
  expect(animation.intermediateSlideFrames).toBeGreaterThan(0);
});
