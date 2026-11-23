import { describe, expect, it } from "vitest";
import index from "../../content/classics/catalog.json";
import { classicLoaders } from "../../apps/web/lib/classic-loaders.generated";
import { buildClassicSources } from "../../tools/generate-classics.mjs";
import {
  classicSummaries,
  classicCount,
  classicById,
} from "../../apps/web/lib/classic-catalog";

describe("public-domain classic catalog", () => {
  it("loads all 20 source-attributed manuscripts, with card-only client data", async () => {
    expect(classicCount).toBe(20);
    expect(new Set(classicSummaries.map((story) => story.id)).size).toBe(20);
    expect(new Set(Object.keys(classicLoaders))).toEqual(
      new Set(index.map(({ id }) => id)),
    );
    for (const story of index) {
      expect(story.id).toMatch(/^classic-[a-z0-9-]+$/);
      expect(story.sourceUrl).toMatch(/^https:\/\/gongu\.copyright\.or\.kr\//);
      expect(story.transcriptionUrl).toMatch(/^https:\/\/github\.com\//);
      expect(story.originalRights).toBe("public-domain-KR");
      const manuscript = (
        await classicLoaders[story.id as keyof typeof classicLoaders]()
      ).default;
      expect(Object.keys(classicById(story.id)!).sort()).toEqual([
        "author",
        "id",
        "summary",
        "title",
      ]);
      expect(manuscript.text.length).toBeGreaterThan(4500);
      expect(manuscript.title).toBe(story.title);
      expect(manuscript.author).toBe(story.author);
      expect(manuscript.sourceRevision).toBe(story.sourceRevision);
      expect(classicById(story.id)?.id).toBe(story.id);
    }
  });
  it("rejects catalog and manuscript drift before generating either module", async () => {
    const [card] = index;
    const doc = (
      await classicLoaders[card!.id as keyof typeof classicLoaders]()
    ).default;
    const works = new Map([[card!.id, doc]]);
    expect(() => buildClassicSources([card, card], works)).toThrow(
      "CLASSIC_ID_INVALID_OR_DUPLICATE",
    );
    expect(() => buildClassicSources([card], new Map())).toThrow(
      "CLASSIC_MANUSCRIPT_MISSING",
    );
    expect(() => buildClassicSources([], works)).toThrow(
      "CLASSIC_MANUSCRIPT_UNLISTED",
    );
    expect(() =>
      buildClassicSources([{ ...card, sourceRevision: "wrong" }], works),
    ).toThrow("CLASSIC_MANUSCRIPT_METADATA_MISMATCH");
    expect(buildClassicSources([card], works)).toEqual(
      buildClassicSources([card], works),
    );
  });

  it("does not expose unknown slugs", () => {
    expect(classicById("does-not-exist")).toBeUndefined();
  });
});
