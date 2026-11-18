import { test, expect } from "@playwright/test";
test("P06 five tarballs render real tokens/schema/core/UI/reader without Next or API", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  const apiRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/"))
      apiRequests.push(r.url());
  });
  await page.goto("/");
  await expect(page.locator("[data-schema-valid]")).toHaveAttribute(
    "data-core-beats",
    "36",
  );
  await expect(page.locator("[data-beat]")).toHaveCount(36);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.locator(".fs-reader")).toHaveClass(/fs-reader-plain/);
  await expect(page.locator(".fs-reader-stage")).toHaveCount(0);
  await page
    .getByRole("button", { name: "컴포넌트 클릭 0회", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "컴포넌트 클릭 1회", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#mail-s01-b01")).toHaveCSS("font-size", "20px");
  await page
    .getByRole("checkbox", { name: "장면 연출 사용", exact: true })
    .check();
  await expect(page.locator(".fs-reader")).toHaveClass(/fs-reader-cinematic/);
  await expect(page.locator(".fs-reader-stage")).toHaveCount(1);
  await page
    .locator("#mail-s01-b02")
    .locator("..")
    .getByRole("button", { name: "이 문장 저장", exact: true })
    .click();
  await expect(
    page
      .locator("#mail-s01-b02")
      .locator("..")
      .getByRole("button", { name: "이 문장 저장 해제", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("checkbox", { name: "효과 줄이기", exact: true })
    .check();
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-motion",
    "reduced",
  );
  await page.screenshot({
    path: `evidence/package-consumer/${testInfo.project.name}.png`,
    fullPage: false,
  });
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});
