import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  resolveActiveBeat,
  resolvePresentation,
  restoreAnchor,
  anchorFromLayout,
  planTextEffect,
  scrollTopForAnchor,
} from "@firstscene/reader-core";
import type {
  Story,
  ReaderPrefs,
  ReadingAnchor,
} from "@firstscene/story-schema";
const story = JSON.parse(
  readFileSync("content/generated/stories/post-office.json", "utf8"),
) as Story;
const prefs: ReaderPrefs = {
  mode: "cinematic",
  reduceMotion: false,
  fontSize: 20,
  theme: "dark",
};
const layout = [
  { id: "mail-s01-b01", top: 100, bottom: 200, ordinal: 0 },
  { id: "mail-s01-b02", top: 240, bottom: 400, ordinal: 1 },
  { id: "mail-s06-b06", top: 800, bottom: 1000, ordinal: 35 },
];
const saved: ReadingAnchor = {
  storyId: story.id,
  contentVersion: 1,
  contentHash: story.contentHash,
  sceneId: "mail-s01",
  beatId: "mail-s01-b02",
  fraction: 0.5,
  furthestOrdinal: 30,
  completed: false,
};
describe("P03 QA-R01/R04 stateless reader core", () => {
  it("resolves42percent crossing boundaries, gaps, first and final positions", () => {
    expect(resolveActiveBeat(layout, 0)).toBe("mail-s01-b01");
    expect(resolveActiveBeat(layout, 239)).toBe("mail-s01-b01");
    expect(resolveActiveBeat(layout, 240)).toBe("mail-s01-b02");
    expect(resolveActiveBeat(layout, 10000)).toBe("mail-s06-b06");
    expect(resolveActiveBeat([...layout].reverse(), 240)).toBe("mail-s01-b02");
  });
  it("returnsnull for empty or invalid measurements", () => {
    expect(resolveActiveBeat([], 0)).toBeNull();
    expect(
      resolveActiveBeat([{ id: "bad", top: NaN, bottom: 5, ordinal: 0 }], 0),
    ).toBeNull();
  });
  it("jumps forward and backward without retained scene/mood state", () => {
    expect(resolvePresentation(story, "mail-s06-b06", prefs).sceneId).toBe(
      "mail-s06",
    );
    expect(resolvePresentation(story, "mail-s01-b04", prefs).mood).toBe(
      "tension",
    );
    expect(resolvePresentation(story, "mail-s01-b05", prefs).mood).toBe("calm");
  });
  it("plain mode has no image/effect while reduced mode retains static images", () => {
    expect(
      resolvePresentation(story, "mail-s01-b04", { ...prefs, mode: "plain" }),
    ).toMatchObject({
      backgroundAssetId: null,
      portraitAssetId: null,
      effectEligible: false,
    });
    expect(
      resolvePresentation(story, "mail-s01-b04", {
        ...prefs,
        reduceMotion: true,
      }),
    ).toMatchObject({ backgroundAssetId: "mail-bg-01", effectEligible: false });
  });
  it("restores retained IDs, scene fallback, first beat fallback and invalid fractions", () => {
    expect(restoreAnchor(story, saved)).toMatchObject({
      reason: "exact",
      anchor: { beatId: saved.beatId, fraction: 0.5 },
    });
    expect(restoreAnchor(story, { ...saved, beatId: "removed" })).toMatchObject(
      {
        reason: "scene-fallback",
        anchor: { beatId: "mail-s01-b01", fraction: 0 },
      },
    );
    expect(
      restoreAnchor(story, { ...saved, beatId: "removed", sceneId: "removed" }),
    ).toMatchObject({ reason: "first-beat" });
    expect(
      restoreAnchor(story, { ...saved, fraction: NaN }).anchor.fraction,
    ).toBe(0);
    expect(
      restoreAnchor(story, { ...saved, storyId: "other" }).anchor.beatId,
    ).toBe("mail-s01-b01");
  });
  it("stores beat-local fractions and never reduces furthest while reversing", () => {
    expect(anchorFromLayout(story, layout, 320, saved)).toMatchObject({
      beatId: "mail-s01-b02",
      fraction: 0.5,
      furthestOrdinal: 30,
    });
    expect(scrollTopForAnchor(layout[1]!, 0.5, 500, 2000)).toBe(110);
    expect(scrollTopForAnchor(layout[0]!, 0, 500, 200)).toBe(0);
  });
  it("graphemes remain whole with combining text and emoji, bounded plan durations", () => {
    const p = planTextEffect("한글 👨‍👩‍👧‍👦 e\u0301", "typewriter", {
      mode: "cinematic",
      reduced: false,
    });
    expect(p.graphemes).toContain("👨‍👩‍👧‍👦");
    expect(p.graphemes).toContain("e\u0301");
    expect(p.durationMs).toBeLessThanOrEqual(1000);
    expect(
      planTextEffect("가".repeat(120), "reveal", {
        mode: "cinematic",
        reduced: false,
      }).durationMs,
    ).toBeLessThanOrEqual(700);
  });
  it.each([
    { mode: "plain", reduced: false },
    { mode: "cinematic", reduced: true },
    { mode: "cinematic", reduced: false, segmenterAvailable: false },
  ] as const)("reduces to full static text under policy %j", (policy) => {
    expect(planTextEffect("문장", "reveal", policy)).toEqual({
      kind: "none",
      graphemes: ["문장"],
      durationMs: 0,
      translatePx: 0,
    });
  });
});
it("P02 fractional direct-link restoration stays inside the intended beat after browser pixel rounding", () => {
  const rect = { id: "fractional", top: 1234.6, bottom: 1400.6, ordinal: 1 };
  const top = scrollTopForAnchor(rect, 0, 844, 5000);
  const actualBaseline = Math.round(top) + 844 * 0.42;
  expect(actualBaseline).toBeGreaterThanOrEqual(rect.top);
  expect(actualBaseline - rect.top).toBeLessThanOrEqual(1);
});
