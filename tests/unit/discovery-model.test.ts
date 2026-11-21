import { describe, expect, it } from "vitest";
import type { StoryCardProps } from "@firstscene/ui";
import {
  canonicalFilters,
  filterDiscovery,
  parseDiscoverySearch,
  previewListings,
  selectAvailability,
  selectGenre,
  serializeDiscoverySearch,
} from "../../apps/web/lib/discovery-model";

const ready: StoryCardProps[] = [
  { id: "post-office", title: "빛을 접어 보내는 우체국", summary: "고요한 편지", href: "/stories/post-office", cover: { variants: [], alt: "" }, tags: ["잔잔함"] },
  { id: "tide-station", title: "수심 없는 역", summary: "도시의 미스터리", href: "/stories/tide-station", cover: { variants: [], alt: "" }, tags: ["미스터리"] },
];

describe("discovery model and state boundaries", () => {
  it("keeps 2 published and 34 unpublished works distinct", () => {
    expect(previewListings).toHaveLength(34);
    const result = filterDiscovery(ready, canonicalFilters({}));
    expect(result.ready).toHaveLength(2);
    expect(result.coming).toHaveLength(34);
    expect(result.count).toBe(36);
  });
  it("normalizes URL query and prevents invalid ready+preview genre", () => {
    const parsed = parseDiscoverySearch("?q=%ED%95%9C%EA%B8%80&status=ready&genre=city&mood=oops");
    expect(parsed).toMatchObject({ q: "한글", status: "ready", genre: "all", mood: "all" });
    expect(serializeDiscoverySearch(parsed)).toBe("?q=%ED%95%9C%EA%B8%80&status=ready");
  });
  it("changes filter choices without silently hiding every readable story", () => {
    let filters = canonicalFilters({ status: "ready" });
    filters = selectGenre(filters, "city");
    expect(filters).toMatchObject({ status: "coming", genre: "city" });
    expect(filterDiscovery(ready, filters).coming).toHaveLength(7);
    filters = selectAvailability(filters, "ready");
    expect(filters.genre).toBe("all");
    expect(filterDiscovery(ready, filters).ready).toHaveLength(2);
  });
  it("filters Korean text and mood with no availability misrepresentation", () => {
    const mystery = filterDiscovery(ready, canonicalFilters({ q: "수심", mood: "mystery", status: "ready" }));
    expect(mystery.ready.map((story) => story.id)).toEqual(["tide-station"]);
    expect(mystery.coming).toEqual([]);
    const none = filterDiscovery(ready, canonicalFilters({ q: "찾을수없는제목" }));
    expect(none.count).toBe(0);
  });
});
