import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createPool } from "@firstscene/server-data";
import { mkdtemp, readdir, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SYNC_KEY } from "../../apps/web/features/reading-sync/outbox";
import { verifyActiveTestDatabase } from "../../tools/database/isolated.mjs";

test.use({ channel: "chromium" });

type SettingsSnapshot = {
  session: { epoch: string };
  preferences: { fontSize: number; revision: number };
};

async function openSettings(page: Page) {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "18px", exact: true }).check();
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  return settingsSnapshot(page);
}

async function settingsSnapshot(page: Page): Promise<SettingsSnapshot> {
  const response = await page.request.get("/api/v1/me");
  expect(response.status()).toBe(200);
  return response.json();
}

function pendingOperation(page: Page) {
  return page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key) ?? "{}").queue?.[0]?.body
        ?.operationId ?? null,
    SYNC_KEY,
  );
}

async function receiptCount(
  owner: ReturnType<typeof createPool>,
  operationId: string,
) {
  const receipt = await owner.query(
    "SELECT count(*)::int AS count FROM firstscene.mutation_receipts WHERE operation_id = $1",
    [operationId],
  );
  return receipt.rows[0]?.count;
}

async function queueSetting(page: Page) {
  await page.getByRole("radio", { name: "24px", exact: true }).check();
  await expect(page.getByText("오프라인 · 임시 저장 중")).toBeVisible();
  await expect
    .poll(async () => Boolean(await pendingOperation(page)))
    .toBe(true);
  return (await pendingOperation(page)) as string;
}

async function confirmRecovery(
  owner: ReturnType<typeof createPool>,
  page: Page,
  before: SettingsSnapshot,
  operationId: string,
) {
  await expect(
    page.getByRole("radio", { name: "24px", exact: true }),
  ).toBeChecked();
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  const after = await settingsSnapshot(page);
  expect(after.session.epoch === before.session.epoch).toBe(true);
  expect(after.preferences).toMatchObject({
    fontSize: 24,
    revision: before.preferences.revision + 1,
  });
  expect(await receiptCount(owner, operationId)).toBe(1);
  expect(await pendingOperation(page)).toBeNull();
}

test("SY-08 Chromium commits a pending setting after real Back navigation", async ({
  baseURL,
}, testInfo) => {
  const owner = createPool(process.env.DIRECT_DATABASE_URL!, 1);
  let browser;
  try {
    await verifyActiveTestDatabase(owner);
    browser = await chromium.launch({
      channel: "chromium",
      ignoreDefaultArgs: ["--disable-back-forward-cache"],
    });
    const context = await browser.newContext({ baseURL });
    // Set the session cookie before the document under test is navigated.
    const setup = await context.newPage();
    const before = await openSettings(setup);
    await setup.close();
    const page = await context.newPage();
    await page.addInitScript(() => {
      const navigation = performance.getEntriesByType("navigation")[0] as
        PerformanceNavigationTiming | undefined;
      let online = navigation?.type === "back_forward";
      Object.defineProperty(navigator, "onLine", { get: () => online });
      window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
          online = true;
          document.documentElement.dataset.restoredFromHistory = "true";
        }
      });
    });
    const cdp = await context.newCDPSession(page);
    const notRestored: string[] = [];
    await cdp.send("Page.enable");
    cdp.on("Page.backForwardCacheNotUsed", (event) => {
      notRestored.push(
        ...event.notRestoredExplanations.map(
          (explanation) => explanation.reason,
        ),
      );
    });
    // The sync client sees an offline document while navigation continues on
    // loopback. Chromium can cache it without a new no-store API response.
    await page.goto("/settings");
    await expect(
      page.getByRole("radio", { name: "18px", exact: true }),
    ).toBeChecked();
    const operationId = await queueSetting(page);
    await page.goto("/about");
    await page.goBack({ waitUntil: "commit" });

    await expect(page).toHaveURL(/\/settings$/);
    const history = await page.evaluate(() => ({
      cached: document.documentElement.dataset.restoredFromHistory === "true",
      type: (
        performance.getEntriesByType(
          "navigation",
        )[0] as PerformanceNavigationTiming
      ).type,
    }));
    expect(history.cached || history.type === "back_forward").toBe(true);
    await testInfo.attach("history-navigation", {
      body: JSON.stringify({ ...history, notRestored }),
      contentType: "application/json",
    });
    await confirmRecovery(owner, page, before, operationId);
  } finally {
    await browser?.close();
    await owner.end();
  }
});

test("SY-08 Chromium resumes a cached document and commits a pending operation", async ({
  baseURL,
}, testInfo) => {
  const owner = createPool(process.env.DIRECT_DATABASE_URL!, 1);
  let browser;
  try {
    await verifyActiveTestDatabase(owner);
    browser = await chromium.launch({
      channel: "chromium",
      ignoreDefaultArgs: ["--disable-back-forward-cache"],
      args: [
        "--enable-features=CacheControlNoStoreEnterBackForwardCache:level/restore-unless-cookie-change",
      ],
    });
    const context = await browser.newContext({ baseURL });
    const setup = await context.newPage();
    const before = await openSettings(setup);
    await setup.close();
    const page = await context.newPage();
    // Keep speculative RSC requests offline as well. A private no-store
    // response would make this document ineligible for Chromium's cache.
    await page.route(
      (url) => url.searchParams.has("_rsc"),
      (route) => route.abort("internetdisconnected"),
    );
    await page.addInitScript(() => {
      let online = false;
      Object.defineProperty(navigator, "onLine", { get: () => online });
      const events: string[] = [];
      for (const event of ["freeze", "resume"]) {
        document.addEventListener(event, () => events.push(event));
      }
      window.addEventListener("pageshow", (event) => {
        if (!event.persisted) return;
        online = true;
        events.push("cached");
        document.documentElement.dataset.cachedLifecycle = events.join(",");
      });
    });
    await page.goto("/settings");
    await expect(
      page.getByRole("radio", { name: "18px", exact: true }),
    ).toBeChecked();
    const operationId = await queueSetting(page);
    // A distinct loopback site makes Chromium swap the browsing instance.
    const elsewhere = new URL("/about", baseURL);
    elsewhere.hostname = "localhost";
    await page.goto(elsewhere.href);
    expect(await receiptCount(owner, operationId)).toBe(0);
    await page.goBack({ waitUntil: "commit" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-cached-lifecycle",
      "freeze,resume,cached",
    );
    await confirmRecovery(owner, page, before, operationId);
    await testInfo.attach("cached-navigation-lifecycle", {
      body: JSON.stringify({
        events: ["freeze", "resume", "persisted pageshow"],
        databaseReceipts: 1,
        revisionDelta: 1,
        uiConfirmed: true,
      }),
      contentType: "application/json",
    });
  } finally {
    await browser?.close();
    await owner.end();
  }
});

async function operationOnDisk(profile: string, operationId: string) {
  const directory = join(profile, "Default", "Local Storage", "leveldb");
  for (const file of await readdir(directory)) {
    if (!/^\d+\.(?:log|ldb|sst)$/.test(file)) continue;
    const bytes = await readFile(join(directory, file)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return Buffer.alloc(0);
      },
    );
    if (bytes.includes(operationId)) return true;
  }
  return false;
}

test("SY-08 Chromium reopens a killed browser profile and commits the same durable operation once", async ({
  baseURL,
}) => {
  test.setTimeout(45000);
  const owner = createPool(process.env.DIRECT_DATABASE_URL!, 1);
  const profile = await realpath(
    await mkdtemp(join(tmpdir(), "firstscene-recovery-")),
  );
  const launch = () =>
    chromium.launchPersistentContext(profile, {
      channel: "chromium",
      args: ["--enable-automation"],
      baseURL,
    });
  let context: BrowserContext | undefined;
  try {
    await verifyActiveTestDatabase(owner);
    context = await launch();
    const established = await context.newPage();
    const before = await openSettings(established);
    // Flush the newly issued session cookie during setup. The process killed
    // below starts with a session that already survives opening this profile.
    await context.close();
    context = await launch();
    const page = await context.newPage();
    await page.goto("/settings");
    await expect(
      page.getByText("서버에 저장됨", { exact: true }),
    ).toBeVisible();
    expect(
      (await settingsSnapshot(page)).session.epoch === before.session.epoch,
    ).toBe(true);
    await context.setOffline(true);
    const operationId = await queueSetting(page);
    await expect
      .poll(() => operationOnDisk(profile, operationId), {
        timeout: 10000,
      })
      .toBe(true);
    expect(await receiptCount(owner, operationId)).toBe(0);

    const cdp = await context.browser()!.newBrowserCDPSession();
    const command = await cdp.send("Browser.getBrowserCommandLine");
    expect(command.arguments.includes("--user-data-dir=" + profile)).toBe(true);
    const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
    const browserPid = processInfo.find((info) => info.type === "browser")?.id;
    if (
      !Number.isInteger(browserPid) ||
      browserPid! <= 1 ||
      browserPid === process.pid
    )
      throw new Error("OWNED_BROWSER_PROCESS_REQUIRED");
    const disconnected = context.waitForEvent("close");
    process.kill(browserPid!, "SIGKILL");
    await disconnected;
    context = await launch();

    const recovered = await context.newPage();
    const requests: string[] = [];
    recovered.on("request", (request) => {
      if (
        request.method() === "PUT" &&
        new URL(request.url()).pathname === "/api/v1/preferences"
      )
        requests.push(request.postDataJSON().operationId);
    });
    await recovered.goto("/settings");
    await confirmRecovery(owner, recovered, before, operationId);
    expect(requests.length).toBe(1);
    expect(requests[0] === operationId).toBe(true);
  } finally {
    await context?.close();
    await owner.end();
    await rm(profile, { recursive: true, force: true });
  }
});
