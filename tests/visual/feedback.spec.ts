import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { capture, readerReady, saved, axe } from "./helpers";
test("feedback initial,accepted,offline and Korean-midnight limit states remain readable", async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto("/read/post-office#mail-s06-b06");
  await readerReady(page);
  const form = page.locator(".reader-feedback");
  await form.scrollIntoViewIfNeeded();
  await saved(page);
  await capture(page, "reader-feedback", "cinematic", "initial");
  await form.getByRole("radio", { name: "편안하게 읽었어요" }).check();
  await form.getByRole("button", { name: "평가 보내기", exact: true }).click();
  await expect(form.getByRole("status")).toContainText(
    "평가가 서버에 저장됐어요",
  );
  await saved(page);
  await capture(page, "reader-feedback", "cinematic", "accepted");
  await context.setOffline(true);
  await expect(form.getByRole("status")).toContainText("오프라인");
  await form.getByRole("radio", { name: "글자 연출이 너무 빨랐어요" }).check();
  await expect(
    form.getByRole("button", { name: "평가 보내기", exact: true }),
  ).toBeDisabled();
  await capture(page, "reader-feedback", "cinematic", "offline");
  await context.setOffline(false);
  await saved(page);
  await expect(
    form.getByRole("button", { name: "평가 보내기", exact: true }),
  ).toBeEnabled();
  for (let i = 0; i < 4; i++) {
    const r = await page.request.post("/api/v1/feedback", {
      headers: { origin: baseURL! },
      data: {
        storyId: "post-office",
        code: "helpful",
        operationId: randomUUID(),
      },
    });
    expect(r.status()).toBe(201);
  }
  await form.getByRole("button", { name: "평가 보내기", exact: true }).click();
  await expect(form.getByRole("status")).toContainText("한국 시간 자정 이후");
  await expect(
    form.getByRole("button", { name: "같은 평가 다시 보내기", exact: true }),
  ).toBeDisabled();
  await capture(page, "reader-feedback", "cinematic", "limit");
  await axe(page);
});
