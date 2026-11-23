import type { ReaderPrefs, ReadingAnchor } from "@firstscene/story-schema";
export const LOCAL_CACHE_KEY = "firstscene:cache:v1";
export const defaultPreferences: ReaderPrefs = {
  mode: "cinematic",
  reduceMotion: false,
  fontSize: 20,
  theme: "dark",
};
export type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type LocalCache = {
  schemaVersion: 1;
  sessionEpoch: string | null;
  expiresAt: string;
  preferences: ReaderPrefs;
  anchors: Record<string, ReadingAnchor>;
  anchorOwners: Record<string, string>;
};
const id = (v: unknown): v is string =>
  typeof v === "string" && /^[a-z][a-z0-9-]{1,63}$/.test(v);
const hash = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export function validPreferences(value: unknown): value is ReaderPrefs {
  if (!value || typeof value !== "object") return false;
  const p = value as ReaderPrefs;
  if (
    Object.keys(p).some(
      (key) => !["mode", "reduceMotion", "fontSize", "theme"].includes(key),
    )
  )
    return false;
  return (
    ["plain", "cinematic"].includes(p.mode) &&
    typeof p.reduceMotion === "boolean" &&
    [18, 20, 22, 24].includes(p.fontSize) &&
    ["dark", "light"].includes(p.theme)
  );
}
export function validAnchor(value: unknown): value is ReadingAnchor {
  if (!value || typeof value !== "object") return false;
  const a = value as ReadingAnchor;
  if (
    Object.keys(a).some(
      (key) =>
        ![
          "storyId",
          "contentVersion",
          "contentHash",
          "sceneId",
          "beatId",
          "fraction",
          "furthestOrdinal",
          "completed",
        ].includes(key),
    )
  )
    return false;
  return (
    id(a.storyId) &&
    id(a.sceneId) &&
    id(a.beatId) &&
    hash(a.contentHash) &&
    Number.isInteger(a.contentVersion) &&
    a.contentVersion > 0 &&
    Number.isFinite(a.fraction) &&
    a.fraction >= 0 &&
    a.fraction <= 1 &&
    Number.isInteger(a.furthestOrdinal) &&
    a.furthestOrdinal >= 0 &&
    a.furthestOrdinal <= 35 &&
    typeof a.completed === "boolean"
  );
}
export function emptyCache(): LocalCache {
  return {
    schemaVersion: 1,
    sessionEpoch: null,
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    preferences: { ...defaultPreferences },
    anchors: {},
    anchorOwners: {},
  };
}
export function decodeCache(raw: string | null): {
  cache: LocalCache;
  notice: string | null;
} {
  if (raw === null) return { cache: emptyCache(), notice: null };
  if (new TextEncoder().encode(raw).length > 65536)
    throw new Error("LOCAL_CACHE_LIMIT");
  const value = JSON.parse(raw) as Partial<LocalCache>;
  if (
    value.schemaVersion !== 1 ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt))
  )
    throw new Error("LOCAL_CACHE_SCHEMA");
  if (Date.parse(value.expiresAt) <= Date.now())
    return {
      cache: emptyCache(),
      notice: "저장 기간이 지나 새 독서 기록을 시작해요.",
    };
  if (!validPreferences(value.preferences))
    throw new Error("LOCAL_CACHE_PREFERENCES");
  const anchors = Object.fromEntries(
    Object.entries(value.anchors ?? {})
      .filter(
        ([key, anchor]) =>
          id(key) && validAnchor(anchor) && key === anchor.storyId,
      )
      .slice(0, 2),
  );
  const epoch =
    typeof value.sessionEpoch === "string" &&
    /^[a-f0-9-]{36}$/.test(value.sessionEpoch)
      ? value.sessionEpoch
      : null;
  return {
    cache: {
      schemaVersion: 1,
      sessionEpoch: epoch,
      expiresAt: value.expiresAt,
      preferences: { ...value.preferences },
      anchors,
      anchorOwners: Object.fromEntries(
        Object.entries(value.anchorOwners ?? {})
          .filter(
            ([key, owner]) =>
              id(key) &&
              Boolean(anchors[key]) &&
              typeof owner === "string" &&
              /^[a-f0-9-]{36}$/i.test(owner),
          )
          .slice(0, 2),
      ),
    },
    notice: null,
  };
}

export function readCache(storage: StoragePort) {
  return decodeCache(storage.getItem(LOCAL_CACHE_KEY));
}
export function writeCache(storage: StoragePort, cache: LocalCache) {
  const raw = JSON.stringify(cache);
  if (new TextEncoder().encode(raw).length > 65536)
    throw new Error("LOCAL_CACHE_LIMIT");
  storage.setItem(LOCAL_CACHE_KEY, raw);
}
