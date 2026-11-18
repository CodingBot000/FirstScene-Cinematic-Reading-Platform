import { test, expect } from "@playwright/test";
import { capture, readerReady, toolbar, geometry, axe } from "./helpers";
test("reader and dialog keep text,44px controls and keyboard focus visible at this viewport", async ({
  page,
  browserName,
}) => {
  await page.goto("/read/post-office#mail-s01-b01");
  await readerReady(page);
  await toolbar(page);
  await geometry(page);
  const position = await page.evaluate(() => ({
    text: document.getElementById("mail-s01-b01")!.getBoundingClientRect().top,
    toolbar: document
      .querySelector(".fs-reading-toolbar")!
      .getBoundingClientRect().bottom,
  }));
  expect(position.text).toBeGreaterThanOrEqual(position.toolbar - 1);
  await capture(page, "reader-reflow", "cinematic", "first");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await axe(page);
  await capture(page, "reader-reflow-settings", "cinematic", "initial");
  let closeReached = false;
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    const focus = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement;
      const r = element.getBoundingClientRect();
      return {
        inside: Boolean(element.closest('[role="dialog"]')),
        label: element.textContent,
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: innerWidth,
        height: innerHeight,
        hit: element.contains(
          document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2),
        ),
      };
    });
    expect(focus.inside).toBe(true);
    expect(focus.hit).toBe(true);
    expect(focus.top).toBeGreaterThanOrEqual(0);
    expect(focus.bottom).toBeLessThanOrEqual(focus.height);
    expect(focus.left).toBeGreaterThanOrEqual(0);
    expect(focus.right).toBeLessThanOrEqual(focus.width);
    if (focus.label === "닫기") closeReached = true;
  }
  expect(closeReached).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "설정", exact: true }),
  ).toBeFocused();
  if (page.viewportSize()!.width <= 640) {
    const focusGeometry = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement;
      const rect = active.getBoundingClientRect();
      const style = getComputedStyle(active);
      const outward = Math.max(
        0,
        Number.parseFloat(style.outlineWidth) +
          Number.parseFloat(style.outlineOffset),
      );
      return {
        focusBottom: rect.bottom + outward,
        statusTop: document
          .querySelector(".fs-save-status")!
          .getBoundingClientRect().top,
      };
    });
    expect(focusGeometry.statusTop).toBeGreaterThanOrEqual(
      focusGeometry.focusBottom,
    );
  }
});
