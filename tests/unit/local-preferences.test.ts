import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { Story, ReadingAnchor } from "@firstscene/story-schema";
import { createReaderStore } from "../../apps/web/features/reading-sync/local-store";
import {
  decodeCache,
  LOCAL_CACHE_KEY,
  defaultPreferences,
  validPreferences,
} from "../../apps/web/lib/reading-cache";
const story = JSON.parse(
  readFileSync("content/generated/stories/post-office.json", "utf8"),
) as Story;
const anchor: ReadingAnchor = {
  storyId: story.id,
  contentVersion: story.version,
  contentHash: story.contentHash,
  sceneId: "mail-s03",
  beatId: "mail-s03-b02",
  fraction: 0.4,
  furthestOrdinal: 20,
  completed: false,
};
function memory() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}
it("P03 preference store keeps SSR deterministic, loads once and persists real local choices", () => {
  const storage = memory(),
    store = createReaderStore(story, () => storage);
  expect(store.getServerSnapshot().ready).toBe(false);
  expect(store.getServerSnapshot().preferences.mode).toBe("plain");
  expect(store.getSnapshot().preferences).toEqual(defaultPreferences);
  const p = {
    ...defaultPreferences,
    mode: "plain" as const,
    fontSize: 24 as const,
  };
  store.savePreferences(p);
  expect(
    createReaderStore(story, () => storage).getSnapshot().preferences,
  ).toEqual(p);
});
it("P03 anchor cache restores IDs/fractions and preserves furthest when going backward", () => {
  const storage = memory(),
    store = createReaderStore(story, () => storage);
  store.saveAnchor(anchor);
  store.saveAnchor({
    ...anchor,
    beatId: "mail-s01-b02",
    sceneId: "mail-s01",
    furthestOrdinal: 1,
  });
  const snapshot = createReaderStore(story, () => storage).getSnapshot();
  expect(snapshot.initialAnchor).toMatchObject({
    beatId: "mail-s01-b02",
    fraction: 0.4,
    furthestOrdinal: 20,
  });
});
it("P03 an absolute expired record is reset with an honest notice", () => {
  const storage = memory(),
    store = createReaderStore(story, () => storage);
  store.saveAnchor(anchor);
  const cache = JSON.parse(storage.map.get(LOCAL_CACHE_KEY)!);
  cache.expiresAt = new Date(Date.now() - 1000).toISOString();
  storage.map.set(LOCAL_CACHE_KEY, JSON.stringify(cache));
  const snapshot = createReaderStore(story, () => storage).getSnapshot();
  expect(snapshot.initialAnchor).toBeNull();
  expect(snapshot.notice).toContain("저장 기간");
});
it("P03 corrupted/oversized/unknown preferences are rejected rather than cast into the reader", () => {
  expect(() => decodeCache("not-json")).toThrow();
  expect(() => decodeCache("가".repeat(30000))).toThrow(/LIMIT/);
  expect(validPreferences({ ...defaultPreferences, fontSize: 200 })).toBe(
    false,
  );
  expect(validPreferences({ ...defaultPreferences, arbitrary: "x" })).toBe(
    false,
  );
  const storage = memory();
  storage.map.set(LOCAL_CACHE_KEY, "{}");
  expect(
    createReaderStore(story, () => storage).getSnapshot().storageError,
  ).toBe(true);
});
it("P03 denied storage preserves current UI preferences and never reports saved", () => {
  const storage = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => {},
  };
  const store = createReaderStore(story, () => storage);
  expect(store.getSnapshot().storageError).toBe(true);
  store.savePreferences({ ...defaultPreferences, fontSize: 24 });
  expect(store.getSnapshot().preferences.fontSize).toBe(24);
  expect(store.getSnapshot().storageError).toBe(true);
  expect(store.getSnapshot().notice).toContain("현재 화면");
});
it("P03 content revision fallback preserves reading without pretending to restore a removed beat", () => {
  const storage = memory(),
    store = createReaderStore(story, () => storage);
  store.saveAnchor({
    ...anchor,
    beatId: "removed-id",
    contentHash: "a".repeat(64),
  });
  const snapshot = createReaderStore(story, () => storage).getSnapshot();
  expect(snapshot.initialAnchor?.beatId).toBe("mail-s03-b01");
  expect(snapshot.notice).toContain("이야기가 갱신");
});
it("P05 write-only storage denial keeps in-memory preferences across subsequent anchor flushes", () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => {},
  };
  const store = createReaderStore(story, () => storage);
  store.getSnapshot();
  store.savePreferences({ ...defaultPreferences, fontSize: 24 });
  store.saveAnchor(anchor);
  expect(store.getSnapshot().preferences.fontSize).toBe(24);
  store.savePreferences({ ...store.getSnapshot().preferences, theme: "light" });
  expect(store.getSnapshot().preferences).toMatchObject({
    fontSize: 24,
    theme: "light",
  });
  expect(store.getSnapshot().storageError).toBe(true);
});
it("P05 a hidden reader cannot overwrite the newer foreground anchor in the shared cache", () => {
  const storage = memory();
  let visibleA = true;
  const ownerA = crypto.randomUUID(),
    ownerB = crypto.randomUUID();
  const a = createReaderStore(story, () => storage, {
    foreground: () => visibleA,
    owner: () => ownerA,
  });
  const b = createReaderStore(story, () => storage, {
    foreground: () => true,
    owner: () => ownerB,
  });
  a.saveAnchor(anchor);
  b.saveAnchor({
    ...anchor,
    sceneId: "mail-s04",
    beatId: "mail-s04-b02",
    fraction: 0.2,
  });
  visibleA = false;
  expect(a.saveAnchor(anchor)).toBe(false);
  expect(
    createReaderStore(story, () => storage).getSnapshot().initialAnchor?.beatId,
  ).toBe("mail-s04-b02");
});
