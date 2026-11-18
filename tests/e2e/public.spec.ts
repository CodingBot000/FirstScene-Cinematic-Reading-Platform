import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
test("P03 QA-U01 home -> introduction -> complete real first chapter without signup", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "문장을 읽고",
  );
  await page
    .getByRole("heading", { name: "빛을 접어 보내는 우체국", exact: true })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(/\/stories\/post-office$/);
  await page.getByRole("link", { name: "첫 장면 읽기", exact: true }).click();
  await expect(page).toHaveURL(/\/read\/post-office#mail-s01-b01$/);
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-beat",
    "mail-s01-b01",
  );
  await expect(page.locator("[data-beat]")).toHaveCount(36);
  await expect(page.locator("#mail-s06-b06")).toContainText(
    "기다리는 시간이 생겼지만",
  );
});
test("P03 QA-U02 title/mood search, accurate empty state and reset preserve real catalog", async ({
  page,
}) => {
  await page.goto("/discover");
  const search = page.getByLabel("작품 제목 검색");
  await search.fill("존재하지않는이야기");
  await expect(page.getByRole("status")).toHaveText("0편의 이야기");
  await expect(search).toBeFocused();
  await expect(page).toHaveURL(/q=/);
  await page.getByRole("button", { name: "필터 초기화" }).click();
  await expect(page.getByRole("status")).toHaveText("2편의 이야기");
  await page.getByRole("radio", { name: "미스터리", exact: true }).check();
  await expect(page.getByRole("status")).toHaveText("1편의 이야기");
  await expect(
    page.getByRole("heading", { name: "수심 없는 역", exact: true }),
  ).toBeVisible();
});
test("P03 QA-U06 complete SSR manuscript remains readable with JS disabled and no database dependency", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    locale: "ko-KR",
  });
  const page = await context.newPage();
  for (const id of ["post-office", "tide-station"]) {
    const response = await page.goto(baseURL + "/read/" + id);
    expect(response?.status()).toBe(200);
    const story = JSON.parse(
      readFileSync("content/generated/stories/" + id + ".json", "utf8"),
    );
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(8);
    await expect(
      page.locator(".fs-reader-main").getByRole("heading", { level: 2 }),
    ).toHaveCount(6);
    await expect(
      page
        .locator(".reader-completion-panel")
        .getByRole("heading", { level: 2 }),
    ).toHaveCount(2);
    await expect(
      page.getByRole("button", {
        name: "이 이야기를 다 읽었어요",
        exact: true,
      }),
    ).toBeDisabled();
    for (const beat of story.scenes.flatMap(
      (s: { beats: unknown[] }) => s.beats,
    ) as { id: string; text: string }[])
      await expect(page.locator("#" + beat.id)).toHaveText(beat.text);
  }
  await context.close();
});
test("P03 responsive public surfaces fit320px and missing stories return404", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  for (const path of [
    "/",
    "/discover",
    "/stories/post-office",
    "/read/tide-station",
    "/about",
  ]) {
    await page.goto(path);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  }
  const response = await page.goto("/stories/nonexistent");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "찾을 수 없어요",
  );
});
test("P03 capture initial desktop and mobile screenshots", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.screenshot({
      path: existsSync(`evidence/ui/home-initial-${viewport.width}.png`)
        ? `evidence/ui/home-current-${viewport.width}.png`
        : `evidence/ui/home-initial-${viewport.width}.png`,
      fullPage: true,
    });
  }
});
