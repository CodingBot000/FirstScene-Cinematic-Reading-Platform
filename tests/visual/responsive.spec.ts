import { test, expect } from "@playwright/test";
import { capture, axe, settlePublicImages } from "./helpers";
test("public surfaces keep readable geometry, keyboard entry and AA-tag axe checks at this viewport", async ({
  page,
  browserName,
}) => {
  for (const [name, path] of [
    ["home", "/"],
    ["discover", "/discover"],
    ["intro-post-office", "/stories/post-office"],
    ["intro-tide-station", "/stories/tide-station"],
    ["classic-reader", "/classics/classic-lucky-day"],
    ["library", "/library"],
    ["settings", "/settings"],
    ["about", "/about"],
    ["design-system", "/design-system"],
  ]) {
    await page.goto(path!);
    if (name === "library")
      await expect(
        page.getByText("아직 남긴 독서 기록이 없어요.", { exact: true }),
      ).toBeVisible();
    if (name === "settings")
      await expect(page.locator(".settings-fieldset")).toBeEnabled();
    await settlePublicImages(page);
    await axe(page);
    await capture(
      page,
      name!,
      "paper",
      name === "library" ? "empty" : "default",
      true,
    );
    // Safari's default link traversal uses Option-Tab; do not change the user's global keyboard preference.
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(
      page.getByRole("link", { name: "본문 바로가기", exact: true }),
    ).toBeFocused();
  }
  await page.goto("/discover");
  await page.getByLabel("작품 제목 검색").fill("찾을수없는제목");
  await expect(page.getByRole("status")).toHaveText("0편의 이야기");
  await expect(page.getByLabel("작품 제목 검색")).toBeFocused();
  await axe(page);
  await capture(page, "discover", "paper", "empty", true);
  const response = await page.goto("/stories/no-such-story");
  expect(response!.status()).toBe(404);
  await axe(page);
  await capture(page, "missing-story", "paper", "404", true);
});
