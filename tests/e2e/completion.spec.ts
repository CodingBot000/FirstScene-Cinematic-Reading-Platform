import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { SYNC_KEY } from "../../apps/web/features/reading-sync/outbox";
async function record(page: import("@playwright/test").Page) {
  const r = await page.request.get("/api/v1/me");
  expect(r.status()).toBe(200);
  return (await r.json()).progress.find(
    (p: { storyId: string }) => p.storyId === "post-office",
  );
}
async function backToFirst(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "목차", exact: true }).click();
  await page.getByRole("dialog").getByRole("link").first().click();
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-scene",
    "mail-s01",
  );
  return page.locator(".fs-reader").getAttribute("data-active-beat");
}
test("P05 completion is an explicit last CTA and a delayed acknowledgement preserves a newer reread anchor", async ({
  page,
}) => {
  await page.goto("/read/post-office#mail-s06-b06");
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  expect((await record(page)).completed).toBe(false);
  let release!: () => void;
  await page.route("**/api/v1/progress/post-office", async (route) => {
    if (!route.request().postDataJSON().completed) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({ response });
  });
  await page.evaluate(() => {
    document.addEventListener("animationstart", (event) => {
      if (event.animationName === "reader-stamp")
        document.documentElement.dataset.completionStamped = "true";
    });
  });
  await page
    .getByRole("button", { name: "이 이야기를 다 읽었어요", exact: true })
    .click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(page.locator(".reader-completion-stamp")).toHaveCount(0);
  const beat = await backToFirst(page);
  const pinned = await page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key)!).queue.filter(
        (p: { key: string }) => p.key === "progress:post-office",
      ),
    SYNC_KEY,
  );
  expect(pinned).toHaveLength(1);
  expect(pinned[0].body).toMatchObject({
    completed: true,
    beatId: "mail-s06-b06",
  });
  release();
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-completion-stamped",
    "true",
  );
  await expect(page.locator(".reader-completion-stamp")).toHaveAttribute(
    "data-stamp-style",
    "postmark",
  );
  await expect.poll(async () => (await record(page)).beatId).toBe(beat);
  expect(await record(page)).toMatchObject({
    completed: true,
    furthestOrdinal: 35,
  });
  await expect(
    page.getByText("완독 기록이 서버에 저장됐어요.", { exact: true }),
  ).toBeVisible();
  await page.locator(".reader-completion-panel").scrollIntoViewIfNeeded();
  await page.locator(".reader-completion-panel").screenshot({
    path: `evidence/ui/current/p05-completion-confirmed-${page.viewportSize()!.width}.png`,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.reload();
  await expect(
    page.getByText("완독 기록이 서버에 저장됐어요.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".reader-completion-stamp")).not.toHaveAttribute(
    "data-animate",
  );
  await expect(
    page
      .locator(".reader-next-story")
      .getByRole("heading", { name: "수심 없는 역", exact: true }),
  ).toBeVisible();
});
test("P05 offline completion stays temporary and reconnect confirms completion before saving the latest anchor", async ({
  page,
  context,
}) => {
  await page.goto("/read/post-office#mail-s06-b06");
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "이 이야기를 다 읽었어요", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "완독 임시 표시됨", exact: true }),
  ).toBeVisible();
  await page.locator(".reader-completion-panel").screenshot({
    path: `evidence/ui/current/p05-completion-local-${page.viewportSize()!.width}.png`,
  });
  const beat = await backToFirst(page);
  await context.setOffline(false);
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  await expect.poll(async () => (await record(page)).beatId).toBe(beat);
  expect(await record(page)).toMatchObject({
    completed: true,
    furthestOrdinal: 35,
  });
  await page.goto("/library");
  await expect(page.getByText("완독한 이야기", { exact: true })).toBeVisible();
  await page.goto("/about");
  await page.screenshot({
    path: `evidence/ui/current/p05-about-${page.viewportSize()!.width}.png`,
    fullPage: true,
  });
});
