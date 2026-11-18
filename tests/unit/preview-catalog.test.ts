import { describe, expect, it } from "vitest";
import {
  previewCount,
  previewShelves,
} from "../../apps/web/lib/preview-catalog";

describe("landing preview catalog", () => {
  const items = previewShelves.flatMap((shelf) => shelf.stories);

  it("keeps exactly 34 unpublished concepts in five shelves", () => {
    expect(previewShelves).toHaveLength(5);
    expect(previewCount).toBe(34);
    expect(items).toHaveLength(34);
  });

  it("has unique safe slugs and usable display metadata", () => {
    const ids = items.map((story) => story.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const story of items) {
      expect(story.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(story.title.trim().length).toBeGreaterThan(3);
      expect(story.summary.trim().length).toBeGreaterThan(15);
      expect(story.symbol.length).toBeGreaterThan(0);
      expect(story.palette.length).toBeGreaterThan(0);
    }
  });

  it("preserves a distinct section identity and accessible heading", () => {
    expect(new Set(previewShelves.map((shelf) => shelf.id)).size).toBe(5);
    expect(previewShelves.every((shelf) => shelf.title.length > 0)).toBe(
      true,
    );
  });
});
