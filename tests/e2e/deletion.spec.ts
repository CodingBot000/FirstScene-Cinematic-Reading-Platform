import { test, expect } from "@playwright/test";
import { SYNC_KEY } from "../../apps/web/features/reading-sync/outbox";
import { LOCAL_CACHE_KEY } from "../../apps/web/features/reader-preferences/local-store";
test("P05 pending or failed deletion never claims erasure in another tab; retry clears actual rows and retained queue", async ({
  page,
  context,
}) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "22px", exact: true }).check();
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  const before = await (await page.request.get("/api/v1/me")).json();
  const peer = await context.newPage();
  let release: (() => void) | undefined;
  try {
    await peer.goto("/settings");
    await expect(
      peer.getByRole("radio", { name: "22px", exact: true }),
    ).toBeChecked();
    await context.route("**/api/v1/preferences", (route) =>
      route.abort("failed"),
    );
    await page.getByRole("radio", { name: "24px", exact: true }).check();
    await expect
      .poll(() =>
        page.evaluate(
          (key) =>
            JSON.parse(localStorage.getItem(key)!).queue.filter(
              (item: { key: string }) => item.key === "preferences",
            ).length,
          SYNC_KEY,
        ),
      )
      .toBe(1);
    await page.route("**/api/v1/me", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.continue();
        return;
      }
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.abort("failed");
    });
    await page
      .getByRole("button", { name: "독서 기록 모두 삭제", exact: true })
      .click();
    await page
      .getByRole("button", { name: "모든 기록 삭제", exact: true })
      .click();
    await expect.poll(() => Boolean(release)).toBe(true);
    await expect(peer.locator('.reading-note[role="status"]')).toContainText(
      "삭제 요청",
    );
    await expect(
      peer.locator('.reading-note[role="status"]'),
    ).not.toContainText("삭제했어요");
    await peer.screenshot({
      path: `evidence/ui/current/p05-deletion-peer-pending-${page.viewportSize()!.width}.png`,
      fullPage: true,
    });
    release!();
    release = undefined;
    await expect(page.getByRole("dialog")).toContainText("삭제하지 못했어요");
    await expect(peer.locator('.reading-note[role="status"]')).toContainText(
      "삭제하지 못했어요",
    );
    await peer.screenshot({
      path: `evidence/ui/current/p05-deletion-peer-failed-${page.viewportSize()!.width}.png`,
      fullPage: true,
    });
    const still = await page.request.get("/api/v1/me");
    expect(still.status()).toBe(200);
    expect((await still.json()).session.epoch).toBe(before.session.epoch);
    const retained = await page.evaluate(
      ({ sync, cache }) => ({
        queue: JSON.parse(localStorage.getItem(sync)!).queue,
        preferences: JSON.parse(localStorage.getItem(cache)!).preferences,
      }),
      { sync: SYNC_KEY, cache: LOCAL_CACHE_KEY },
    );
    expect(
      retained.queue.some(
        (item: { key: string; body: { fontSize?: number } }) =>
          item.key === "preferences" && item.body.fontSize === 24,
      ),
    ).toBe(true);
    expect(retained.preferences.fontSize).toBe(24);
    await page.unrouteAll({ behavior: "wait" });
    await context.unrouteAll({ behavior: "wait" });
    await page
      .getByRole("button", { name: "모든 기록 삭제", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(peer.locator('.reading-note[role="status"]')).toContainText(
      "삭제했어요",
    );
    expect((await page.request.get("/api/v1/me")).status()).toBe(401);
    await expect(
      peer.getByRole("radio", { name: "20px", exact: true }),
    ).toBeChecked();
    expect(
      await page.evaluate(
        ({ sync, cache }) => [
          localStorage.getItem(sync),
          localStorage.getItem(cache),
        ],
        { sync: SYNC_KEY, cache: LOCAL_CACHE_KEY },
      ),
    ).toEqual([null, null]);
    await page.reload();
    expect((await page.request.get("/api/v1/me")).status()).toBe(401);
  } finally {
    release?.();
    await peer.close();
  }
});
test("P05 a stale tab with delayed notifications cannot recreate erased cache during pagehide after a new session begins", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "BroadcastChannel", { value: undefined });
    const add = window.addEventListener;
    window.addEventListener = function (type: string, ...args: unknown[]) {
      if (type !== "storage") Reflect.apply(add, window, [type, ...args]);
    } as typeof window.addEventListener;
    const addDoc = document.addEventListener;
    document.addEventListener = function (type: string, ...args: unknown[]) {
      if (type !== "visibilitychange")
        Reflect.apply(addDoc, document, [type, ...args]);
    } as typeof document.addEventListener;
  });
  await page.goto("/read/post-office#mail-s03-b02");
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  const peer = await context.newPage();
  try {
    await peer.goto("/settings");
    await peer
      .getByRole("button", { name: "독서 기록 모두 삭제", exact: true })
      .click();
    await peer
      .getByRole("button", { name: "모든 기록 삭제", exact: true })
      .click();
    await expect(peer.getByRole("dialog")).toHaveCount(0);
    await expect(
      peer.getByText("이 브라우저의 독서 기록을 삭제했어요.", { exact: true }),
    ).toBeVisible();
    await peer.goto("/read/tide-station#tide-s02-b03");
    await expect(
      peer.getByText("서버에 저장됨", { exact: true }),
    ).toBeVisible();
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent("pagehide")),
    );
    const cached = await peer.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).anchors,
      LOCAL_CACHE_KEY,
    );
    expect(Object.keys(cached)).toEqual(["tide-station"]);
    const me = await (await peer.request.get("/api/v1/me")).json();
    expect(me.progress.map((p: { storyId: string }) => p.storyId)).toEqual([
      "tide-station",
    ]);
  } finally {
    await peer.close();
  }
});
test("P05 failed deletion can be cancelled explicitly without discarding real records or the retained pending choice", async ({
  page,
  context,
}) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "22px", exact: true }).check();
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  const before = await (await page.request.get("/api/v1/me")).json();
  await context.route("**/api/v1/preferences", (route) =>
    route.abort("failed"),
  );
  await page.getByRole("radio", { name: "24px", exact: true }).check();
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).queue.length,
        SYNC_KEY,
      ),
    )
    .toBe(1);
  await page.route("**/api/v1/me", (route) =>
    route.request().method() === "DELETE"
      ? route.abort("failed")
      : route.continue(),
  );
  await page
    .getByRole("button", { name: "독서 기록 모두 삭제", exact: true })
    .click();
  await page
    .getByRole("button", { name: "모든 기록 삭제", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("삭제하지 못했어요");
  await context.unrouteAll({ behavior: "wait" });
  await page
    .getByRole("button", { name: "기존 기록 계속 사용", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "24px", exact: true }),
  ).toBeChecked();
  const after = await (await page.request.get("/api/v1/me")).json();
  expect(after.session).toEqual(before.session);
  expect(after.preferences.fontSize).toBe(24);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).queue,
      SYNC_KEY,
    ),
  ).toEqual([]);
});
