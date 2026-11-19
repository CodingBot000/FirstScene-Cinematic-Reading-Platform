import { describe, expect, it } from "vitest";
import {
  cinematicScenes,
  sceneIndexAtProgress,
} from "../../apps/web/lib/cinematic-scenes";

describe("cinematic prologue scenes", () => {
  it("keeps exactly three semantic image-and-copy units", () => {
    expect(cinematicScenes).toHaveLength(3);
    expect(new Set(cinematicScenes.map((scene) => scene.id)).size).toBe(3);
    for (const scene of cinematicScenes) {
      expect(scene.eyebrow).toBeTruthy();
      expect(scene.heading).toBeTruthy();
      expect(scene.accent).toBeTruthy();
      expect(scene.description).toHaveLength(2);
      expect(scene.illustration).toBeTruthy();
      expect([
        "/read/post-office",
        "/read/tide-station",
        "/discover",
      ]).toContain(scene.href);
      expect(scene.action).toBeTruthy();
    }
  });

  it("maps the scroll progress to a stable active chapter", () => {
    expect(sceneIndexAtProgress(0, 3)).toBe(0);
    expect(sceneIndexAtProgress(0.34, 3)).toBe(1);
    expect(sceneIndexAtProgress(0.68, 3)).toBe(2);
    expect(sceneIndexAtProgress(1, 3)).toBe(2);
    expect(sceneIndexAtProgress(-10, 3)).toBe(0);
    expect(sceneIndexAtProgress(12, 3)).toBe(2);
    expect(sceneIndexAtProgress(Number.NaN, 3)).toBe(0);
    expect(sceneIndexAtProgress(0.5, 0)).toBe(0);
  });
});
