import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { classicSummaries, classicCount, classicById } from "../../apps/web/lib/classic-catalog";

describe("public-domain classic catalog", () => {
  it("has exactly 20 source-attributed complete manuscripts", () => {
    expect(classicCount).toBe(20);
    expect(new Set(classicSummaries.map((story) => story.id)).size).toBe(20);
    for (const story of classicSummaries) {
      expect(story.id).toMatch(/^classic-[a-z0-9-]+$/);
      expect(story.sourceUrl).toMatch(/^https:\/\/gongu\.copyright\.or\.kr\//);
      expect(story.transcriptionUrl).toMatch(/^https:\/\/github\.com\//);
      expect(story.originalRights).toBe("public-domain-KR");
      const path = "content/classics/works/" + story.id + ".json";
      expect(existsSync(path)).toBe(true);
      const manuscript = JSON.parse(readFileSync(path, "utf8"));
      expect(manuscript.text.length).toBeGreaterThan(4500);
      expect(manuscript.title).toBe(story.title);
      expect(manuscript.author).toBe(story.author);
      expect(manuscript.sourceRevision).toBe(story.sourceRevision);
      expect(classicById(story.id)?.id).toBe(story.id);
    }
  });
  it("does not expose unknown slugs", () => {
    expect(classicById("does-not-exist")).toBeUndefined();
  });
});
