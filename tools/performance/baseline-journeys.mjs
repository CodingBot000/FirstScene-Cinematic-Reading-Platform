import { expect } from "@playwright/test";
import { readBaselineSample } from "./baseline-probe.mjs";

function mark(page, name) {
  return page.evaluate((label) => window.firstsceneBaseline.mark(label), name);
}

function prefetched(page, pathname) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === pathname &&
      response.ok() &&
      response.request().headers().rsc === "1" &&
      !response.request().headers()["next-router-prefetch"],
  );
}

async function openCover(page, ready, link, type) {
  await link.scrollIntoViewIfNeeded();
  expect(await (await ready).finished()).toBeNull();
  await link.click();
  await page.waitForFunction(
    (kind) =>
      window.firstsceneBaseline.transitions.some(
        (row) =>
          row.types.includes(kind) &&
          row.coverAnimation &&
          row.finished !== null,
      ),
    type,
  );
}

async function scrollToBeat(page, id) {
  await page.locator("#" + id).evaluate((beat) => {
    const bounds = beat.getBoundingClientRect();
    window.scrollTo({
      top: window.scrollY + bounds.top + 8 - window.innerHeight * 0.42,
      behavior: "instant",
    });
  });
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-beat",
    id,
  );
}

async function sceneAttempt(page, index, slowDecode = false) {
  const beat = "mail-s0" + index + "-b01";
  const scene = "mail-s0" + index;
  await page
    .locator(
      "[aria-labelledby='" + scene + "'] .fs-reader-mobile-image > picture img",
    )
    .evaluate((image) => image.decode());
  const first = await page.evaluate((force) => {
    const probe = window.firstsceneBaseline;
    probe.slowDecode = force;
    return { animations: probe.slides.length, decodes: probe.decodes.length };
  }, slowDecode);
  await scrollToBeat(page, beat);
  await page.waitForFunction(({ animations, decodes }) => {
    const probe = window.firstsceneBaseline;
    const slide = probe.slides.slice(animations);
    const decode = probe.decodes.slice(decodes);
    return (
      slide.length > 0 &&
      slide.every((row) => row.settled !== null) &&
      decode.some((row) => row.end !== null)
    );
  }, first);
  return page.evaluate(({ animations, decodes }) => {
    const probe = window.firstsceneBaseline;
    probe.slowDecode = false;
    return {
      animations: probe.slides.slice(animations),
      decodes: probe.decodes.slice(decodes),
    };
  }, first);
}

async function applyFilter(page, probe) {
  const search = page.getByRole("searchbox", { name: "작품 제목 검색" });
  const results = page.getByRole("status");
  const beforeFilter = await page.evaluate(() => window.performance.now());
  if (probe) await mark(page, "filter_change_start");
  await search.fill("baseline-fixture-no-match");
  await expect(results).toHaveText("0편의 이야기");
  await expect(page).toHaveURL(/q=baseline-fixture-no-match/);
  if (probe) await mark(page, "filter_change_end");
  return (await page.evaluate(() => window.performance.now())) - beforeFilter;
}

export async function measureFilterOverhead(page, origin, probe) {
  await page.goto(origin + "/discover", { waitUntil: "load" });
  const filterMs = await applyFilter(page, probe);
  const navigationLoadMs = await page.evaluate(
    () => window.performance.getEntriesByType("navigation")[0].loadEventEnd,
  );
  return { filterMs, navigationLoadMs };
}

export async function exerciseBaselineJourneys(page, origin) {
  const coverData = prefetched(page, "/stories/post-office");
  await page.goto(origin + "/discover", { waitUntil: "load" });
  const filterMs = await applyFilter(page, true);
  await page.getByRole("button", { name: "필터 초기화" }).click();
  await expect(page.getByRole("status")).toContainText("56편의 이야기");
  await expect(page).toHaveURL(/\/discover$/);
  const cover = page.getByRole("link", {
    name: "빛을 접어 보내는 우체국의 오리지널 표지",
    exact: true,
  });
  const readerData = prefetched(page, "/read/post-office");
  await cover.scrollIntoViewIfNeeded();
  await cover.locator("img").evaluate((image) => image.decode());
  await openCover(page, coverData, cover, "story-cover");
  await expect(page).toHaveURL(/\/stories\/post-office$/);
  await page.locator(".detail-cover img").evaluate((image) => image.decode());
  await mark(page, "anchor_restore_start");
  await openCover(
    page,
    readerData,
    page.getByRole("link", { name: "첫 장면 읽기", exact: true }),
    "story-open",
  );
  await expect(page).toHaveURL(/\/read\/post-office(?:#.*)?$/);
  await expect(page.locator(".reader-page")).toHaveAttribute(
    "data-reader-ready",
    "true",
  );
  await mark(page, "reader_ready");
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-active-beat",
    "mail-s01-b01",
  );
  await mark(page, "anchor_restore_end");

  await expect(page.getByText("서버에 저장됨", { exact: true })).toBeVisible();
  console.log(JSON.stringify({ journey: "reader-ready" }));

  await scrollToBeat(page, "mail-s01-b06");
  await mark(page, "scene_transition_start");
  const normal = await sceneAttempt(page, 2);
  await mark(page, "scene_transition_end");
  await scrollToBeat(page, "mail-s02-b06");
  const deadline = await sceneAttempt(page, 3, true);
  expect(deadline.animations.some((row) => row.cancelled)).toBe(true);
  console.log(JSON.stringify({ journey: "scenes-observed" }));

  const complete = page.getByRole("button", {
    name: "이 이야기를 다 읽었어요",
  });
  await expect(complete).toBeEnabled();
  await page.evaluate(() => {
    window.firstsceneBaseline.completion = true;
  });
  await complete.click();
  await expect(page.locator(".reader-completion-stamp")).toBeVisible();
  await page.waitForFunction(() =>
    ["sync_enqueue", "sync_ack", "completion_stamp"].every((label) =>
      window.firstsceneBaseline.markNames.includes(label),
    ),
  );
  const completion = await page.evaluate(() => {
    const time = (name) =>
      window.performance.getEntriesByName(name, "mark")[0].startTime;
    return {
      enqueue: time("sync_enqueue"),
      ack: time("sync_ack"),
      stamp: time("completion_stamp"),
    };
  });
  expect(completion.ack).toBeGreaterThanOrEqual(completion.enqueue);
  expect(completion.stamp).toBeGreaterThanOrEqual(completion.ack);
  console.log(JSON.stringify({ journey: "server-confirmation-observed" }));

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-motion",
    "reduced",
  );
  const slides = await page.evaluate(
    () => window.firstsceneBaseline.slides.length,
  );
  await scrollToBeat(page, "mail-s04-b01");
  expect(
    await page.evaluate(() => window.firstsceneBaseline.slides.length),
  ).toBe(slides);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-motion",
    "full",
  );
  await mark(page, "settings_apply_start");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("radio", { name: "효과 줄이기", exact: true }).check();
  await expect(page.locator(".fs-reader")).toHaveAttribute(
    "data-motion",
    "reduced",
  );
  await mark(page, "settings_apply_end");
  await page.keyboard.press("Escape");
  console.log(JSON.stringify({ journey: "settings-applied" }));

  return {
    filterMs,
    scene: { normal, deadline },
    completion,
    ...(await page.evaluate(readBaselineSample)),
  };
}
