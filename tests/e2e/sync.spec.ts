import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createPool } from "@firstscene/server-data";
import { SYNC_KEY } from "../../apps/web/features/reading-sync/outbox";
import { verifyActiveTestDatabase } from "../../tools/database/isolated.mjs";
async function saved(page: Page) {
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
}
async function me(page: Page) {
  const response = await page.request.get("/api/v1/me");
  expect(response.status()).toBe(200);
  return response.json();
}

test("SY-01 a browser setting becomes saved only after the committed request is replayed", async ({
  page,
}, testInfo) => {
  const requestLog = process.env.FIRSTSCENE_TEST_REQUEST_LOG;
  if (!requestLog) throw new Error("DISPOSABLE_REQUEST_LOG_REQUIRED");
  const outcome = (requestId: string) => {
    try {
      return readFileSync(requestLog, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .find((entry) => entry.requestId === requestId)?.outcome;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return undefined;
    }
  };
  const owner = createPool(process.env.DIRECT_DATABASE_URL!, 1);
  try {
    await verifyActiveTestDatabase(owner);
    await page.goto("/settings");
    await page.getByRole("radio", { name: "18px", exact: true }).check();
    await saved(page);
    const originalRevision = (await me(page)).preferences.revision;
    const requests: { operationId: string; body: string }[] = [];
    let commitRequestId: string | undefined;
    let release!: () => void;
    const resumeReplay = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/v1/preferences", async (route) => {
      const body = route.request().postData()!;
      requests.push({ operationId: JSON.parse(body).operationId, body });
      if (requests.length === 1) {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        commitRequestId = response.headers()["x-request-id"];
        await route.abort("connectionreset");
        return;
      }
      await resumeReplay;
      await route.continue();
    });
    let replay;
    try {
      await page.getByRole("radio", { name: "24px", exact: true }).check();
      await expect.poll(() => Boolean(commitRequestId)).toBe(true);
      await expect.poll(() => outcome(commitRequestId!)).toBe("committed");
      await expect.poll(() => requests.length).toBe(2);
      expect(requests[1]!.body === requests[0]!.body).toBe(true);
      await expect(
        page.getByText("서버에 저장됨", { exact: true }),
      ).not.toBeVisible();
      expect((await me(page)).preferences).toMatchObject({
        fontSize: 24,
        revision: originalRevision + 1,
      });
      replay = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname === "/api/v1/preferences" &&
          response.status() === 200,
      );
    } finally {
      release();
    }
    const replayRequestId = (await replay).headers()["x-request-id"]!;
    expect(
      Boolean(replayRequestId) && replayRequestId !== commitRequestId,
    ).toBe(true);
    await expect.poll(() => outcome(replayRequestId)).toBe("replayed");
    await saved(page);
    const receipts = await owner.query(
      `SELECT p.font_size, p.revision::int, count(r.operation_id)::int AS receipts
       FROM firstscene.mutation_receipts r
       JOIN firstscene.preferences p USING (session_id)
       WHERE r.operation_id = $1
       GROUP BY p.font_size, p.revision`,
      [requests[0]!.operationId],
    );
    expect(receipts.rows).toEqual([
      { font_size: 24, revision: originalRevision + 1, receipts: 1 },
    ]);
    expect(requests).toHaveLength(2);
    const durable = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      SYNC_KEY,
    );
    expect(durable.queue).toEqual([]);
    await testInfo.attach("browser-to-database-confirmation", {
      body: JSON.stringify({
        firstRequest: "committed",
        secondRequest: "replayed",
        databaseReceipts: 1,
        revisionDelta: 1,
        uiConfirmed: true,
      }),
      contentType: "application/json",
    });
  } finally {
    await owner.end();
  }
});
test("P05 actual DB settings ack persists across reload with safe browser-only queue", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "24px", exact: true }).check();
  await saved(page);
  expect((await me(page)).preferences.fontSize).toBe(24);
  await page.screenshot({
    path: "evidence/ui/p05-settings-server-ack.png",
    fullPage: true,
  });
  const durable = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    SYNC_KEY,
  );
  expect(durable.queue).toEqual([]);
  expect(JSON.stringify(durable)).not.toMatch(
    /token|password|DATABASE_URL|cookie/i,
  );
  await page.reload();
  await expect(
    page.getByRole("radio", { name: "24px", exact: true }),
  ).toBeChecked();
  expect((await me(page)).preferences.revision).toBeGreaterThanOrEqual(1);
});
test("P05 navigation preserves the latest setting while another document holds the outbox storage lock", async ({
  page,
  context,
}) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "24px", exact: true }).check();
  await saved(page);
  const holder = await context.newPage();
  await holder.goto("/about");
  await holder.evaluate(() => {
    const state = window as unknown as { held?: boolean; release?: () => void };
    void navigator.locks.request("firstscene:outbox-storage:v1", async () => {
      state.held = true;
      await new Promise<void>((resolve) => {
        state.release = resolve;
      });
    });
  });
  await holder.waitForFunction(
    () => (window as unknown as { held?: boolean }).held,
  );
  try {
    await page.bringToFront();
    await page.getByRole("radio", { name: "18px", exact: true }).check();
    await page.goto("/read/post-office");
    await expect(page.locator("#mail-s01-b01")).toHaveCSS("font-size", "18px");
    expect((await me(page)).preferences.fontSize).toBe(24);
  } finally {
    await holder.evaluate(() =>
      (window as unknown as { release?: () => void }).release?.(),
    );
    await holder.close();
  }
  await saved(page);
  expect((await me(page)).preferences.fontSize).toBe(18);
  await page.reload();
  await expect(page.locator("#mail-s01-b01")).toHaveCSS("font-size", "18px");
});
test("P05 offline latest intent is bounded, honestly marked, and converges to PostgreSQL on reconnect", async ({
  page,
  context,
}) => {
  await page.goto("/read/post-office");
  await expect(page.locator("[data-reader-ready]")).toHaveAttribute(
    "data-reader-ready",
    "true",
  );
  await saved(page);
  await context.setOffline(true);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  for (const size of [22, 24, 18, 24])
    await page.getByRole("radio", { name: `${size}px`, exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("오프라인 · 임시 저장 중", { exact: true }),
  ).toBeVisible();
  const queued = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).queue,
    SYNC_KEY,
  );
  expect(
    queued.filter((i: { key: string }) => i.key === "preferences"),
  ).toHaveLength(1);
  await page.screenshot({
    path: "evidence/ui/p05-reader-offline.png",
    fullPage: false,
  });
  await context.setOffline(false);
  await saved(page);
  expect((await me(page)).preferences.fontSize).toBe(24);
});
test("P05 delayed real server ack never reverses a newer visible preference", async ({
  page,
}) => {
  await page.goto("/settings");
  let release!: () => void;
  let held = false;
  await page.route("**/api/v1/preferences", async (route) => {
    if (!held) {
      held = true;
      const response = await route.fetch();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fulfill({ response });
    } else await route.continue();
  });
  await page.getByRole("radio", { name: "22px", exact: true }).check();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByRole("radio", { name: "24px", exact: true }).check();
  release();
  await saved(page);
  await expect(
    page.getByRole("radio", { name: "24px", exact: true }),
  ).toBeChecked();
  expect((await me(page)).preferences.fontSize).toBe(24);
});
test("P05 two actual tabs converge through storage events without BroadcastChannel", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "BroadcastChannel", { value: undefined });
  });
  await page.goto("/settings");
  await page.getByRole("radio", { name: "22px", exact: true }).check();
  await saved(page);
  const other = await context.newPage();
  try {
    await other.goto("/settings");
    await expect(
      other.getByRole("radio", { name: "22px", exact: true }),
    ).toBeChecked();
    await page.getByRole("radio", { name: "24px", exact: true }).check();
    await saved(page);
    await expect(
      other.getByRole("radio", { name: "24px", exact: true }),
    ).toBeChecked();
    await other.getByRole("radio", { name: "18px", exact: true }).check();
    await saved(other);
    await expect(
      page.getByRole("radio", { name: "18px", exact: true }),
    ).toBeChecked();
    expect((await me(page)).preferences.fontSize).toBe(18);
  } finally {
    await other.close();
  }
});
test("P05 expired cookie blocks old epoch queue without silently creating another session", async ({
  page,
  context,
}) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "22px", exact: true }).check();
  await saved(page);
  const before = await me(page);
  await context.setOffline(true);
  await page.getByRole("radio", { name: "24px", exact: true }).check();
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).queue.length,
        SYNC_KEY,
      ),
    )
    .toBe(1);
  await page.close();
  await context.clearCookies();
  await context.setOffline(false);
  const next = await context.newPage();
  let creates = 0;
  next.on("request", (r) => {
    if (r.url().endsWith("/api/v1/session") && r.method() === "POST") creates++;
  });
  await next.goto("/settings");
  await expect(
    next.getByText(/이전 임시 요청은 새 세션에 보내지 않았어요/),
  ).toBeVisible();
  expect(creates).toBe(0);
  expect((await next.request.get("/api/v1/me")).status()).toBe(401);
  const durable = await next.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    SYNC_KEY,
  );
  expect(durable.epoch).toBe(before.session.epoch);
  expect(durable.queue).toHaveLength(1);
  await next.close();
});
test("P05 deletion drains a delayed real Set-Cookie then removes cookie/cache/outbox without resurrection", async ({
  page,
  context,
}) => {
  let release!: () => void;
  let held = false;
  await page.route("**/api/v1/session", async (route) => {
    const response = await route.fetch();
    held = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({ response });
  });
  await page.goto("/settings");
  await page.getByRole("radio", { name: "24px", exact: true }).check();
  await expect.poll(() => held).toBe(true);
  await page
    .getByRole("button", { name: "독서 기록 모두 삭제", exact: true })
    .click();
  await page
    .getByRole("button", { name: "모든 기록 삭제", exact: true })
    .click();
  release();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("이 브라우저의 독서 기록을 삭제했어요.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("이 브라우저의 독서 기록을 삭제했어요.", { exact: true }),
  ).toBeFocused();
  expect((await page.request.get("/api/v1/me")).status()).toBe(401);
  expect(
    (await context.cookies()).some((c) => c.name === "firstscene_dev"),
  ).toBe(false);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) =>
        ["firstscene:cache:v1", "firstscene:sync:v1"].includes(key),
      ),
    ),
  ).toEqual([]);
  await page.reload();
  expect((await page.request.get("/api/v1/me")).status()).toBe(401);
});
test("P05 blocked localStorage reports temporary-save failure while current controls and actual server save still work", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("denied", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await page.goto("/settings");
  await page.getByRole("radio", { name: "24px", exact: true }).check();
  await expect(
    page.getByRole("radio", { name: "24px", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByText(
      /임시 저장을 사용할 수 없어요|임시 기록을 읽지 못했어요|임시 저장할 수 없어요/,
    ),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const r = await page.request.get("/api/v1/me");
      return r.status() === 200 ? (await r.json()).preferences.fontSize : 0;
    })
    .toBe(24);
});
test("P05 real server progress restores after local caches are cleared; explicit hash and trusted input retain priority", async ({
  page,
}) => {
  await page.goto("/read/post-office");
  await expect(page.locator("[data-reader-ready]")).toHaveAttribute(
    "data-reader-ready",
    "true",
  );
  await page.locator("#mail-s04-b03").evaluate((element) => {
    const r = element.getBoundingClientRect();
    scrollTo({
      top: scrollY + r.top + r.height * 0.3 - innerHeight * 0.42,
      behavior: "instant",
    });
  });
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-beat",
    "mail-s04-b03",
  );
  await saved(page);
  await expect
    .poll(async () => (await me(page)).progress[0]?.beatId)
    .toBe("mail-s04-b03");
  await page.evaluate(() => {
    localStorage.removeItem("firstscene:cache:v1");
    localStorage.removeItem("firstscene:sync:v1");
    localStorage.removeItem("firstscene:preference-intent:v1");
    localStorage.removeItem("firstscene:preference-binding:v1");
  });
  await page.reload();
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-beat",
    "mail-s04-b03",
  );
  await saved(page);
  expect((await me(page)).progress[0].beatId).toBe("mail-s04-b03");
  await page.goto("/read/post-office#mail-s02-b02");
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-beat",
    "mail-s02-b02",
  );
  await saved(page);
  expect((await me(page)).progress[0].furthestOrdinal).toBeGreaterThanOrEqual(
    20,
  );
});
test("P05 pagehide flush sends a real keepalive write without claiming unload delivery is guaranteed", async ({
  page,
}) => {
  await page.goto("/read/post-office");
  await saved(page);
  await page.locator("#mail-s03-b02").evaluate((element) => {
    const r = element.getBoundingClientRect();
    scrollTo({
      top: scrollY + r.top + r.height * 0.4 - innerHeight * 0.42,
      behavior: "instant",
    });
  });
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-beat",
    "mail-s03-b02",
  );
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pagehide")),
  );
  await expect
    .poll(async () => (await me(page)).progress[0]?.beatId)
    .toBe("mail-s03-b02");
  const local = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("firstscene:cache:v1")!).anchors[
        "post-office"
      ],
  );
  expect(local.beatId).toBe("mail-s03-b02");
});
test("P05 trusted scroll wins over a delayed initial server-only restoration", async ({
  page,
}) => {
  await page.goto("/read/post-office#mail-s04-b03");
  await saved(page);
  await expect
    .poll(async () => (await me(page)).progress[0]?.beatId)
    .toBe("mail-s04-b03");
  await page.evaluate(() => {
    localStorage.removeItem("firstscene:cache:v1");
    localStorage.removeItem("firstscene:sync:v1");
    localStorage.removeItem("firstscene:preference-intent:v1");
    localStorage.removeItem("firstscene:preference-binding:v1");
  });
  let release!: () => void;
  let held = false;
  await page.route("**/api/v1/me", async (route) => {
    if (held) {
      await route.continue();
      return;
    }
    held = true;
    const response = await route.fetch();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({ response });
  });
  await page.goto("/read/post-office");
  await expect.poll(() => Boolean(release)).toBe(true);
  const initialY = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 700);
  await expect
    .poll(() => page.evaluate(() => scrollY))
    .toBeGreaterThan(initialY + 400);
  await expect(page.locator(".fs-reader")).not.toHaveAttribute(
    "data-active-beat",
    "mail-s04-b03",
  );
  const before = await page
    .locator(".fs-reader")
    .getAttribute("data-active-beat");
  release();
  await saved(page);
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-beat",
    before!,
  );
  expect(before).not.toBe("mail-s04-b03");
});
