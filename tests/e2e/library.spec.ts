import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
async function ack(page: import("@playwright/test").Page) {
  await expect
    .poll(async () => {
      const r = await page.request.get("/api/v1/me");
      return r.status() === 200 ? (await r.json()).bookmarks.length : -1;
    })
    .toBeGreaterThan(0);
}
async function current(page: import("@playwright/test").Page) {
  const r = await page.request.get("/api/v1/me");
  expect(r.status()).toBe(200);
  return r.json();
}
test("P05 library is honestly empty without creating an anonymous session or fake records", async ({
  page,
}) => {
  let creates = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/v1/session") && r.method() === "POST") creates++;
  });
  await page.goto("/library");
  await expect(
    page.getByText("아직 남긴 독서 기록이 없어요.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "아직 저장된 독서 기록이 없어요.",
  );
  expect(creates).toBe(0);
  expect((await page.request.get("/api/v1/me")).status()).toBe(401);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `evidence/ui/current/p05-library-empty-${page.viewportSize()!.width}.png`,
    fullPage: true,
  });
});
test("P05 keyboard story and quote bookmarks persist in actual DB, library opens exact beat and deletion focuses next/title", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/stories/post-office");
  const save = page.getByRole("button", { name: "☆ 작품 저장", exact: true });
  await expect(save).toBeEnabled();
  await save.focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "★ 작품 저장됨", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await ack(page);
  await page.getByRole("link", { name: /첫 장면 읽기/ }).click();
  await expect(page.locator("[data-reader-ready]")).toHaveAttribute(
    "data-reader-ready",
    "true",
  );
  for (const id of ["mail-s01-b02", "mail-s03-b02"]) {
    const button = page
      .locator("#" + id)
      .locator("..")
      .getByRole("button", { name: "이 문장 저장", exact: true });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(
      page
        .locator("#" + id)
        .locator("..")
        .getByRole("button", { name: "이 문장 저장 해제", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await expect.poll(async () => (await current(page)).bookmarks.length).toBe(3);
  const clear = page
    .locator("#mail-s03-b02")
    .locator("..")
    .getByRole("button", { name: "이 문장 저장 해제", exact: true });
  const hit = await clear.evaluate((button) => {
    const b = button.getBoundingClientRect(),
      p = button
        .closest(".fs-reader-beat")!
        .querySelector("p")!
        .getBoundingClientRect();
    const tooltip = button
      .parentElement!.querySelector(".fs-tooltip")!
      .getBoundingClientRect();
    return {
      width: b.width,
      height: b.height,
      tooltipAllParagraphOverlap: [
        ...document.querySelectorAll(".fs-reader-main p"),
      ].reduce((sum, paragraph) => {
        const rect = paragraph.getBoundingClientRect();
        return (
          sum +
          Math.max(
            0,
            Math.min(tooltip.right, rect.right) -
              Math.max(tooltip.left, rect.left),
          ) *
            Math.max(
              0,
              Math.min(tooltip.bottom, rect.bottom) -
                Math.max(tooltip.top, rect.top),
            )
        );
      }, 0),
      tooltipOverlap:
        Math.max(
          0,
          Math.min(tooltip.right, p.right) - Math.max(tooltip.left, p.left),
        ) *
        Math.max(
          0,
          Math.min(tooltip.bottom, p.bottom) - Math.max(tooltip.top, p.top),
        ),
      overlap:
        Math.max(0, Math.min(b.right, p.right) - Math.max(b.left, p.left)) *
        Math.max(0, Math.min(b.bottom, p.bottom) - Math.max(b.top, p.top)),
    };
  });
  expect(hit.width).toBeGreaterThanOrEqual(44);
  expect(hit.height).toBeGreaterThanOrEqual(44);
  expect(hit.overlap).toBe(0);
  expect(hit.tooltipOverlap).toBe(0);
  expect(hit.tooltipAllParagraphOverlap).toBe(0);
  await page.screenshot({
    path: `evidence/ui/current/p05-reader-bookmark-${page.viewportSize()!.width}.png`,
    fullPage: false,
  });
  await page.goto("/library");
  await expect(page.locator(".library-quotes li")).toHaveCount(2);
  await expect(page.locator(".library-stories li")).toHaveCount(1);
  await expect(page.locator(".library-recent li")).toHaveCount(1);
  const progressText = await page
    .getByText(/최대로 읽은 위치 약 \d+%/)
    .innerText();
  const percentage = Number(progressText.match(/\d+/)![0]);
  expect(percentage).toBeGreaterThan(0);
  expect(percentage).toBeLessThan(100);
  expect(
    await page
      .locator("progress")
      .evaluate((progress) => (progress as HTMLProgressElement).position),
  ).toBeCloseTo(percentage / 100, 5);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `evidence/ui/current/p05-library-full-${page.viewportSize()!.width}.png`,
    fullPage: true,
  });
  const target = page.locator('[data-bookmark="mail-s03-b02"]');
  await target.getByRole("link", { name: "문장 열기 →", exact: true }).click();
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-beat",
    "mail-s03-b02",
  );
  await page.goto("/library");
  const rows = page.locator(".library-quotes li");
  await expect(rows).toHaveCount(2);
  const nextKey = await rows.nth(1).getAttribute("data-bookmark");
  await rows.first().getByRole("button").focus();
  await page.keyboard.press("Enter");
  await expect(rows).toHaveCount(1);
  await expect(
    page.locator(`[data-bookmark="${nextKey}"]`).getByRole("button"),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(rows).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "저장한 문장", exact: true }),
  ).toBeFocused();
  await expect.poll(async () => (await current(page)).bookmarks.length).toBe(1);
  await page.reload();
  await expect(page.locator(".library-stories li")).toHaveCount(1);
  await expect(page.locator(".library-quotes li")).toHaveCount(0);
  const isolated = await browser.newContext({ baseURL });
  try {
    const b = await isolated.newPage();
    await b.goto("/library");
    await expect(
      b.getByText("아직 남긴 독서 기록이 없어요.", { exact: true }),
    ).toBeVisible();
    expect((await b.request.get("/api/v1/me")).status()).toBe(401);
  } finally {
    await isolated.close();
  }
});
test("P05 offline bookmark desired state persists until reconnect and then appears in the library", async ({
  page,
  context,
}) => {
  await page.goto("/read/post-office");
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  await context.setOffline(true);
  const button = page
    .locator("#mail-s01-b02")
    .locator("..")
    .getByRole("button", { name: "이 문장 저장", exact: true });
  await button.click();
  await expect(
    page.getByText("오프라인 · 임시 저장 중", { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect.poll(async () => (await current(page)).bookmarks.length).toBe(1);
  await page.goto("/library");
  await expect(page.locator('[data-bookmark="mail-s01-b02"]')).toBeVisible();
});
test("P05 quota64 rejects a65th UI item with recovery after desired-state deletion", async ({
  page,
}) => {
  const headers = {
    origin: process.env.FIRSTSCENE_TEST_ORIGIN!,
    "content-type": "application/json",
  };
  await page.request.post("/api/v1/session", { headers, data: {} });
  const stories = ["post-office", "tide-station"].map((id) =>
    JSON.parse(readFileSync(`content/generated/stories/${id}.json`, "utf8")),
  );
  const targets = stories.flatMap((story) =>
    [
      "__story__",
      ...story.scenes.flatMap((scene: { beats: { id: string }[] }) =>
        scene.beats.map((b) => b.id),
      ),
    ].map((target) => ({ storyId: story.id, target, version: story.version })),
  );
  for (const b of targets.slice(0, 64))
    expect(
      (
        await page.request.put(`/api/v1/bookmarks/${b.storyId}/${b.target}`, {
          headers,
          data: { contentVersion: b.version, operationId: randomUUID() },
        })
      ).status(),
    ).toBe(200);
  const next = targets[64]!;
  await page.goto(`/read/${next.storyId}#${next.target}`);
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  const button = page
    .locator("#" + next.target)
    .locator("..")
    .getByRole("button", { name: "이 문장 저장", exact: true });
  await button.click();
  await expect(page.getByText(/저장 가능한 항목은 64개예요/)).toBeVisible();
  expect((await current(page)).bookmarks).toHaveLength(64);
  const existing = targets.find(
    (t) => t.storyId === next.storyId && t.target !== "__story__",
  )!;
  await page
    .locator("#" + existing.target)
    .locator("..")
    .getByRole("button", { name: "이 문장 저장 해제", exact: true })
    .click();
  await expect
    .poll(async () => (await current(page)).bookmarks.length)
    .toBe(63);
  await button.click();
  await expect
    .poll(async () => (await current(page)).bookmarks.length)
    .toBe(64);
});
test("P05 library keeps local state during a controlled HTTP503 fault and exposes manual retry", async ({
  page,
}) => {
  await page.goto("/read/post-office");
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  await page.route("**/api/v1/me", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "STORAGE_UNAVAILABLE",
          message: "temporarily unavailable",
          requestId: randomUUID(),
        },
      }),
    });
    expect(response.status()).toBe(200);
  });
  await page.goto("/library");
  await expect(
    page.getByText("서버 기록을 확인하지 못했어요.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".library-recent li")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /다시 시도/ })).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await page.getByRole("button", { name: /다시 시도/ }).click();
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  await expect(
    page.getByText("서버 기록을 확인하지 못했어요.", { exact: true }),
  ).toHaveCount(0);
});
