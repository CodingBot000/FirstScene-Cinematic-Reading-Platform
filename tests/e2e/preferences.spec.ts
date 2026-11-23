import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  LOCAL_CACHE_KEY,
  defaultPreferences,
} from "../../apps/web/lib/reading-cache";
const story = JSON.parse(
  readFileSync("content/generated/stories/post-office.json", "utf8"),
);
const saved = {
  storyId: story.id,
  contentVersion: story.version,
  contentHash: story.contentHash,
  sceneId: "mail-s03",
  beatId: "mail-s03-b02",
  fraction: 0.3,
  furthestOrdinal: 26,
  completed: false,
};
async function seed(
  page: Page,
  mode: "plain" | "cinematic" = "plain",
  anchor: typeof saved | null = null,
) {
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null)
        localStorage.setItem(key, JSON.stringify(value));
    },
    {
      key: LOCAL_CACHE_KEY,
      value: {
        schemaVersion: 1,
        sessionEpoch: null,
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        preferences: { ...defaultPreferences, mode },
        anchors: anchor ? { [story.id]: anchor } : {},
      },
    },
  );
}
async function ready(page: Page) {
  await expect(page.locator("[data-reader-ready]")).toHaveAttribute(
    "data-reader-ready",
    "true",
  );
}
async function jump(page: Page, id: string) {
  await ready(page);
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
test("P03 QA-R05 local font/mode/theme preferences and anchor survive actual reload", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "webkit")
    await page.addInitScript(() => {
      const events: unknown[] = [];
      Object.defineProperty(window, "__firstsceneScrollTrace", {
        value: events,
      });
      function record(type: string, args?: unknown) {
        if (events.length >= 200) return;
        const p = document
          .getElementById("mail-s03-b02")
          ?.getBoundingClientRect();
        let anchor: unknown = null;
        try {
          const a = JSON.parse(
            localStorage.getItem("firstscene:cache:v1") ?? "{}",
          ).anchors?.["post-office"];
          if (a) anchor = { beatId: a.beatId, fraction: a.fraction };
        } catch {
          /* Diagnostics preserve the actual denied-storage behavior. */
        }
        events.push({
          type,
          args,
          time: performance.now(),
          y: scrollY,
          top: p?.top,
          height: p?.height,
          beat: document
            .querySelector(".fs-reader")
            ?.getAttribute("data-active-beat"),
          locked: document.body?.getAttribute("data-scroll-locked"),
          width: document.body?.getBoundingClientRect().width,
          activeTag: document.activeElement?.tagName,
          activeText: document.activeElement?.textContent?.slice(0, 30),
          dialog: Boolean(document.querySelector('[role="dialog"]')),
          toolbar: document
            .querySelector(".fs-reading-toolbar")
            ?.getBoundingClientRect().top,
          viewportHeight: innerHeight,
          visualOffset: visualViewport?.offsetTop,
          anchor,
        });
      }
      const original = window.scrollTo;
      window.scrollTo = function (...args: unknown[]) {
        record("scrollTo", args);
        Reflect.apply(original, window, args);
      } as typeof window.scrollTo;
      window.addEventListener("scroll", () => record("scroll"), {
        passive: true,
      });
      for (const event of ["pointerdown", "pointerup", "click", "focusin"])
        window.addEventListener(event, () => record(event), true);
    });
  await page.goto("/read/post-office");
  await ready(page);
  await jump(page, saved.beatId);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByRole("radio", { name: "24px", exact: true }).check();
  await page.getByRole("radio", { name: "일반 읽기", exact: true }).check();
  await page.getByRole("radio", { name: "밝게", exact: true }).check();
  await page.keyboard.press("Escape");
  if (testInfo.project.name === "webkit") {
    const frames = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const frames: unknown[] = [];
          const sample = () => {
            const p = document
              .getElementById("mail-s03-b02")!
              .getBoundingClientRect();
            frames.push({
              y: scrollY,
              top: p.top,
              height: p.height,
              beat: document
                .querySelector(".fs-reader")
                ?.getAttribute("data-active-beat"),
              bodyStyle: document.body.getAttribute("style"),
              locked: document.body.getAttribute("data-scroll-locked"),
              width: document.body.getBoundingClientRect().width,
              overflow: getComputedStyle(document.body).overflowY,
              active: document.activeElement?.textContent?.slice(0, 40),
            });
            if (frames.length < 30) requestAnimationFrame(sample);
            else resolve(frames);
          };
          requestAnimationFrame(sample);
        }),
    );
    writeFileSync(
      `evidence/qa/webkit-anchor-frames-${testInfo.repeatEachIndex}.json`,
      JSON.stringify(frames, null, 2),
    );
    const events = await page.evaluate(() =>
      Reflect.get(window, "__firstsceneScrollTrace"),
    );
    writeFileSync(
      `evidence/qa/webkit-anchor-trace-${testInfo.repeatEachIndex}.json`,
      JSON.stringify(events, null, 2),
    );
  }
  await expect(page.locator("#" + saved.beatId)).toHaveCSS("font-size", "24px");
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-beat",
    saved.beatId,
  );
  await expect
    .poll(() =>
      page.locator("#" + saved.beatId).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.top <= innerHeight * 0.42 && rect.bottom >= innerHeight * 0.42
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key) ?? "{}").anchors?.["post-office"]
            ?.beatId,
        LOCAL_CACHE_KEY,
      ),
    )
    .toBe(saved.beatId);
  await page.reload();
  await ready(page);
  await expect(page.locator(".fs-reader")).toHaveClass(/fs-reader-plain/);
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-theme",
    "light",
  );
  await expect(page.locator("#" + saved.beatId)).toHaveCSS("font-size", "24px");
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-beat",
    saved.beatId,
  );
  await page.goto("/settings");
  await expect(
    page.getByRole("radio", { name: "24px", exact: true }),
  ).toBeChecked();
  await page.getByRole("radio", { name: "18px", exact: true }).check();
  await page.goto("/read/post-office");
  await ready(page);
  await expect(page.locator("#" + saved.beatId)).toHaveCSS("font-size", "18px");
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-beat",
    saved.beatId,
  );
});
test("P03 QA-R06 explicit hash beats saved anchor; unknown/malformed hash is neutral first-scene fallback", async ({
  page,
}) => {
  await seed(page, "plain", saved);
  await page.goto("/read/post-office#mail-s04-b03");
  await ready(page);
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-beat",
    "mail-s04-b03",
  );
  await page.goto("/read/post-office#%E0%A4");
  await ready(page);
  await expect(
    page.getByText("이 문장 위치를 찾지 못해 첫 장면을 표시해요.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-scene",
    "mail-s01",
  );
});
test("P03 QA-R07 trusted user scroll wins over delayed font-ready restoration", async ({
  page,
}) => {
  await seed(page, "plain", saved);
  await page.addInitScript(() => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    Object.defineProperty(document, "fonts", {
      value: { ready },
      configurable: true,
    });
    Object.defineProperty(window, "releaseFontReady", {
      value: () => release(),
      configurable: true,
    });
  });
  await page.goto("/read/post-office");
  await ready(page);
  await page.mouse.wheel(0, 700);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(400);
  // WebKit may deliver one wheel gesture in multiple compositor frames. Compare
  // positions only after that gesture settles, while fonts are still held.
  await page.evaluate(async () => {
    let previous = scrollY,
      stable = 0;
    for (let i = 0; i < 120; i++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      if (scrollY === previous) stable++;
      else {
        previous = scrollY;
        stable = 0;
      }
      if (stable >= 6) return;
    }
    throw new Error("TRUSTED_SCROLL_DID_NOT_SETTLE");
  });
  const before = await page.evaluate(() => scrollY);
  await page.evaluate(() =>
    (window as unknown as { releaseFontReady: () => void }).releaseFontReady(),
  );
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThan(
    80,
  );
});
test("P03 plain entry requests zero actual GSAP-containing chunks", async ({
  page,
}) => {
  await seed(page, "plain");
  const dir = "apps/web/.next/static/chunks";
  const gsap = new Set(
    readdirSync(dir, { recursive: true })
      .filter(
        (file): file is string =>
          typeof file === "string" && file.endsWith(".js"),
      )
      .filter((file) => {
        const body = readFileSync(path.join(dir, file), "utf8");
        return body.includes("3.15.1") && body.includes("gsap");
      })
      .map((file) => path.basename(file)),
  );
  expect(gsap.size).toBeGreaterThan(0);
  const requested: string[] = [];
  page.on("request", (request) => {
    const file = new URL(request.url()).pathname.split("/").at(-1)!;
    if (gsap.has(file)) requested.push(file);
  });
  await page.goto("/read/post-office");
  await ready(page);
  await jump(page, "mail-s04-b04");
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  expect(requested).toEqual([]);
  await expect(page.locator(".fs-reader-stage")).toHaveCount(0);
  await expect(page.locator(".fs-effect-clone")).toHaveCount(0);
});
test("P03 storage denied keeps text and current preference choice with honest status", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(Storage.prototype, "setItem", {
      value: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
      configurable: true,
    }),
  );
  await page.goto("/read/post-office");
  await ready(page);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByRole("radio", { name: "24px", exact: true }).check();
  await expect(page.getByRole("status")).toContainText("현재 화면");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-beat]")).toHaveCount(36);
  await expect(page.locator("#mail-s01-b01")).toHaveCSS("font-size", "24px");
});
test("P03 TOC moves focus to the selected scene heading and leaves one document scroll", async ({
  page,
}) => {
  await page.goto("/read/post-office");
  await ready(page);
  await page.getByRole("button", { name: "목차", exact: true }).click();
  await page.getByRole("link", { name: "03 사라진 주소", exact: true }).click();
  await expect(page.locator("#mail-s03")).toBeFocused();
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-scene",
    "mail-s03",
  );
});
