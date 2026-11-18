import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { createPool } from "@firstscene/server-data";
import type { Pool } from "@firstscene/server-data";
import { verifyActiveTestDatabase } from "../../tools/database/isolated.mjs";
let owner: Pool;
test.beforeAll(async () => {
  owner = createPool(process.env.DIRECT_DATABASE_URL!, 1);
  await verifyActiveTestDatabase(owner);
});
test.afterAll(async () => {
  await owner?.end();
});
async function entry(page: import("@playwright/test").Page) {
  await page.goto("/read/post-office#mail-s06-b06");
  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  const form = page.locator(".reader-feedback");
  await form.scrollIntoViewIfNeeded();
  return form;
}
async function rows(page: import("@playwright/test").Page) {
  const me = await (await page.request.get("/api/v1/me")).json();
  const id = (
    await owner.query("SELECT id FROM firstscene.sessions WHERE epoch=$1", [
      me.session.epoch,
    ])
  ).rows[0].id;
  return (
    await owner.query(
      "SELECT code FROM firstscene.feedback WHERE session_id=$1",
      [id],
    )
  ).rows;
}
test("KST feedback keyboard submit stores actual SQL, cookieA/B quota isolation and readable limit UI", async ({
  page,
  playwright,
  baseURL,
  browserName,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const form = await entry(page);
  await expect(page).toHaveTitle(/빛을 접어 보내는 우체국/);
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
  const radio = form.getByRole("radio", {
    name: "연출이 몰입에 도움이 됐어요",
  });
  await radio.focus();
  await page.keyboard.press(" ");
  await expect(radio).toBeChecked();
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(
    form.getByRole("button", { name: "평가 보내기", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(form.getByRole("status")).toContainText(
    "평가가 서버에 저장됐어요",
  );
  expect(await rows(page)).toEqual([{ code: "helpful" }]);
  await form.screenshot({
    path: `evidence/feedback/ui/accepted-${browserName}-${page.viewportSize()!.width}.png`,
  });
  for (let i = 0; i < 4; i++) {
    const r = await page.request.post("/api/v1/feedback", {
      headers: { origin: baseURL! },
      data: {
        storyId: "post-office",
        code: "comfortable",
        operationId: randomUUID(),
      },
    });
    expect(r.status()).toBe(201);
  }
  await form.getByRole("radio", { name: "편안하게 읽었어요" }).check();
  await form.getByRole("button", { name: "평가 보내기", exact: true }).click();
  await expect(form.getByRole("status")).toContainText("한국 시간 자정 이후");
  await expect(
    form.getByRole("button", { name: "같은 평가 다시 보내기", exact: true }),
  ).toBeDisabled();
  expect(await rows(page)).toHaveLength(5);
  const other = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL!, "content-type": "application/json" },
  });
  try {
    await other.post("/api/v1/session", { data: {} });
    expect(
      (
        await other.post("/api/v1/feedback", {
          data: {
            storyId: "post-office",
            code: "too_fast",
            operationId: randomUUID(),
          },
        })
      ).status(),
    ).toBe(201);
  } finally {
    await other.dispose();
  }
  await form.screenshot({
    path: `evidence/feedback/ui/limit-${browserName}-${page.viewportSize()!.width}.png`,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(errors).toEqual([]);
});
test("lost feedback response retries the identical operation without duplicate SQL; offline selection requires explicit send", async ({
  page,
  context,
  browserName,
}) => {
  const form = await entry(page),
    sent: string[] = [];
  await page.route("**/api/v1/feedback", async (route) => {
    sent.push(route.request().postData()!);
    if (sent.length === 1) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await form.getByRole("radio", { name: "글자 연출이 너무 빨랐어요" }).check();
  await form.getByRole("button", { name: "평가 보내기", exact: true }).click();
  await expect(form.getByRole("status")).toContainText(
    "전송 결과를 확인하지 못했어요",
  );
  await expect(form.getByRole("radio").first()).toBeDisabled();
  expect(await rows(page)).toEqual([{ code: "too_fast" }]);
  await form.screenshot({
    path: `evidence/feedback/ui/retry-${browserName}-${page.viewportSize()!.width}.png`,
  });
  await form
    .getByRole("button", { name: "같은 평가 다시 보내기", exact: true })
    .click();
  await expect(form.getByRole("status")).toContainText(
    "평가가 서버에 저장됐어요",
  );
  expect(sent).toHaveLength(2);
  expect(sent[0]).toBe(sent[1]);
  expect(await rows(page)).toHaveLength(1);
  await context.setOffline(true);
  await expect(form.getByRole("status")).toContainText("오프라인");
  await form.getByRole("radio", { name: "편안하게 읽었어요" }).check();
  await expect(
    form.getByRole("button", { name: "평가 보내기", exact: true }),
  ).toBeDisabled();
  await form.screenshot({
    path: `evidence/feedback/ui/offline-${browserName}-${page.viewportSize()!.width}.png`,
  });
  await context.setOffline(false);
  await expect(
    form.getByRole("button", { name: "평가 보내기", exact: true }),
  ).toBeEnabled();
  expect(sent).toHaveLength(2);
  await form.getByRole("button", { name: "평가 보내기", exact: true }).click();
  await expect(form.getByRole("status")).toContainText(
    "평가가 서버에 저장됐어요",
  );
  expect(await rows(page)).toHaveLength(2);
});
test("deletion in another tab waits for in-flight feedback and clears actual row without stale success", async ({
  page,
  context,
}) => {
  const form = await entry(page);
  const me = await (await page.request.get("/api/v1/me")).json();
  const id = (
    await owner.query("SELECT id FROM firstscene.sessions WHERE epoch=$1", [
      me.session.epoch,
    ])
  ).rows[0].id;
  let release: () => void = () => {};
  let held = false;
  await page.route("**/api/v1/feedback", async (route) => {
    const response = await route.fetch();
    held = true;
    await new Promise<void>((r) => {
      release = r;
    });
    await route.fulfill({ response });
  });
  const peer = await context.newPage();
  try {
    await peer.goto("/settings");
    await form.getByRole("radio", { name: "편안하게 읽었어요" }).check();
    await form
      .getByRole("button", { name: "평가 보내기", exact: true })
      .click();
    await expect.poll(() => held).toBe(true);
    expect(
      (
        await owner.query(
          "SELECT 1 FROM firstscene.feedback WHERE session_id=$1",
          [id],
        )
      ).rowCount,
    ).toBe(1);
    await peer
      .getByRole("button", { name: "독서 기록 모두 삭제", exact: true })
      .click();
    await peer
      .getByRole("button", { name: "모든 기록 삭제", exact: true })
      .click();
    await expect(form.getByRole("status")).toContainText("기록 삭제 상태");
    await expect(form.getByRole("status")).not.toContainText(
      "평가가 서버에 저장됐어요",
    );
    release();
    await expect(peer.getByRole("dialog")).toHaveCount(0);
    expect(
      (
        await owner.query(
          "SELECT 1 FROM firstscene.feedback WHERE session_id=$1",
          [id],
        )
      ).rowCount,
    ).toBe(0);
    expect((await page.request.get("/api/v1/me")).status()).toBe(401);
    await expect(form.getByRole("status")).not.toContainText(
      "평가가 서버에 저장됐어요",
    );
  } finally {
    release();
    await peer.close();
  }
});
