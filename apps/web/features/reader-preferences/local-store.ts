import type {
  Story,
  ReadingAnchor,
  ReaderPrefs,
} from "@firstscene/story-schema";
import { restoreAnchor } from "@firstscene/reader-core";
import {
  readPreferenceIntent,
  intentInScope,
  decodeReset,
  decodeDurable,
  RESET_KEY,
  SYNC_KEY,
  PREFERENCES_INTENT_KEY,
} from "../reading-sync/outbox";
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
let documentOwner: string | undefined;
export function readingDocumentOwner() {
  return (documentOwner ??= crypto.randomUUID());
}
export type ReaderSnapshot = {
  anchors: Readonly<Record<string, ReadingAnchor>>;
  ready: boolean;
  preferences: ReaderPrefs;
  initialAnchor: ReadingAnchor | null;
  storageError: boolean;
  notice: string | null;
};
export const serverSnapshot: ReaderSnapshot = {
  anchors: {},
  ready: false,
  preferences: { ...defaultPreferences, mode: "plain" },
  initialAnchor: null,
  storageError: false,
  notice: null,
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
function emptyCache(): LocalCache {
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
export function createReaderStore(
  story?: Story,
  storageProvider: () => StoragePort = () => localStorage,
  environment = {
    foreground: () =>
      typeof document === "undefined" || document.visibilityState !== "hidden",
    owner: readingDocumentOwner,
  },
) {
  let cache = emptyCache();
  let snapshot = serverSnapshot;
  let initialized = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  function overlayPreferenceIntent() {
    const storage = storageProvider();
    const intent = readPreferenceIntent(storage);
    const reset = decodeReset(storage.getItem(RESET_KEY));
    if (
      !intent ||
      ["deleted", "deleting", "failed"].includes(reset.phase) ||
      !intentInScope(intent, reset.id, cache.sessionEpoch)
    )
      return;
    const shared = decodeDurable(storage.getItem(SYNC_KEY), reset.id);
    if (intent.pending.changedAt <= (shared?.settled.preferences ?? -1)) return;
    const body = intent.pending.body;
    if ("fontSize" in body)
      cache.preferences = {
        mode: body.mode,
        reduceMotion: body.effects === "reduced",
        fontSize: body.fontSize,
        theme: body.theme,
      };
  }
  function load() {
    let notice: string | null;
    let error = false;
    try {
      const decoded = decodeCache(storageProvider().getItem(LOCAL_CACHE_KEY));
      cache = decoded.cache;
      overlayPreferenceIntent();
      notice = decoded.notice;
    } catch {
      error = true;
      notice =
        "임시 기록을 읽지 못했어요. 현재 화면에서는 계속 읽을 수 있어요.";
    }
    let anchor = story ? (cache.anchors[story.id] ?? null) : null;
    if (anchor && story) {
      const resolved = restoreAnchor(story, anchor);
      if (
        anchor.contentHash !== story.contentHash ||
        resolved.reason !== "exact"
      )
        notice = "이야기가 갱신되어 가까운 위치에서 이어 읽어요.";
      anchor = resolved.anchor;
    }
    if (story && typeof location !== "undefined" && location.hash) {
      let linked = location.hash.slice(1);
      try {
        linked = decodeURIComponent(linked);
      } catch {
        linked = "invalid-hash";
      }
      if (
        !story.scenes.some((scene) =>
          scene.beats.some((beat) => beat.id === linked),
        )
      ) {
        notice = "이 문장 위치를 찾지 못해 첫 장면을 표시해요.";
        anchor = null;
      }
    }
    snapshot = {
      anchors: cache.anchors,
      ready: true,
      preferences: cache.preferences,
      initialAnchor: anchor,
      storageError: error,
      notice,
    };
    initialized = true;
  }
  function write() {
    try {
      const raw = JSON.stringify(cache);
      if (new TextEncoder().encode(raw).length > 65536)
        throw new Error("LOCAL_CACHE_LIMIT");
      storageProvider().setItem(LOCAL_CACHE_KEY, raw);
      return true;
    } catch {
      return false;
    }
  }
  function refreshForWrite() {
    try {
      const raw = storageProvider().getItem(LOCAL_CACHE_KEY);
      if (raw === null && snapshot.storageError) return;
      cache = decodeCache(raw).cache;
      overlayPreferenceIntent();
    } catch {
      /* Keep the current in-memory selections when storage is unavailable. */
    }
  }
  function saveAnchor(anchor: ReadingAnchor) {
    if (!validAnchor(anchor)) return false;
    if (!initialized) load();
    refreshForWrite();
    const owner = environment.owner();
    if (
      !environment.foreground() &&
      cache.anchorOwners[anchor.storyId] &&
      cache.anchorOwners[anchor.storyId] !== owner
    )
      return false;
    const previous = cache.anchors[anchor.storyId];
    if (previous?.contentHash === anchor.contentHash)
      anchor = {
        ...anchor,
        furthestOrdinal: Math.max(
          previous.furthestOrdinal,
          anchor.furthestOrdinal,
        ),
        completed: previous.completed || anchor.completed,
      };
    cache = {
      ...cache,
      anchors: { ...cache.anchors, [anchor.storyId]: anchor },
      anchorOwners: { ...cache.anchorOwners, [anchor.storyId]: owner },
    };
    const saved = write();
    if (!saved && !snapshot.storageError) {
      snapshot = {
        ...snapshot,
        storageError: true,
        notice:
          "이 브라우저에 임시 저장을 사용할 수 없어요. 현재 화면의 선택만 유지돼요.",
      };
      notify();
    }
    return true;
  }
  function savePreferences(preferences: ReaderPrefs) {
    if (!validPreferences(preferences)) throw new Error("PREFERENCES_INVALID");
    if (!initialized) load();
    refreshForWrite();
    cache = { ...cache, preferences: { ...preferences } };
    const saved = write();
    snapshot = {
      ...snapshot,
      preferences: cache.preferences,
      storageError: !saved,
      notice: saved
        ? null
        : "이 브라우저에 임시 저장을 사용할 수 없어요. 현재 화면의 선택만 유지돼요.",
    };
    notify();
    if (saved && typeof window !== "undefined")
      window.dispatchEvent(new Event("firstscene:preferences"));
  }
  function onExternal() {
    if (!initialized) return;
    try {
      const raw = storageProvider().getItem(LOCAL_CACHE_KEY);
      if (raw === null && snapshot.storageError) return;
      const next = decodeCache(raw);
      cache = next.cache;
      overlayPreferenceIntent();
      const incomingAnchor =
        story && !snapshot.initialAnchor && cache.anchors[story.id]
          ? restoreAnchor(story, cache.anchors[story.id]!).anchor
          : snapshot.initialAnchor;
      if (
        JSON.stringify(snapshot.preferences) !==
          JSON.stringify(cache.preferences) ||
        JSON.stringify(snapshot.anchors) !== JSON.stringify(cache.anchors) ||
        incomingAnchor !== snapshot.initialAnchor
      ) {
        snapshot = {
          ...snapshot,
          preferences: cache.preferences,
          initialAnchor: incomingAnchor,
          anchors: cache.anchors,
          notice: next.notice,
        };
        notify();
      }
    } catch {
      /* Do not replace an active reader from an invalid external storage event. */
    }
  }
  function onHashChange() {
    if (!initialized || !story) return;
    let id = location.hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      id = "invalid-hash";
    }
    const invalid =
      id &&
      !story.scenes.some((scene) => scene.beats.some((beat) => beat.id === id));
    const message = "이 문장 위치를 찾지 못해 첫 장면을 표시해요.";
    if (invalid || snapshot.notice === message) {
      snapshot = { ...snapshot, notice: invalid ? message : null };
      notify();
    }
  }
  function onErased() {
    cache = emptyCache();
    snapshot = {
      ...serverSnapshot,
      ready: true,
      preferences: cache.preferences,
      anchors: {},
      notice: null,
    };
    notify();
  }
  return {
    getSnapshot: () => {
      if (!initialized) load();
      return snapshot;
    },
    getServerSnapshot: () => serverSnapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (typeof window !== "undefined") {
        const storage = (event: StorageEvent) => {
          if (event.key === LOCAL_CACHE_KEY) {
            if (event.newValue === null) onErased();
            else onExternal();
          } else if (
            [PREFERENCES_INTENT_KEY, SYNC_KEY].includes(event.key ?? "")
          )
            onExternal();
        };
        window.addEventListener("storage", storage);
        window.addEventListener("firstscene:preferences", onExternal);
        window.addEventListener("hashchange", onHashChange);
        window.addEventListener("firstscene:records-erased", onErased);
        return () => {
          listeners.delete(listener);
          window.removeEventListener("storage", storage);
          window.removeEventListener("firstscene:preferences", onExternal);
          window.removeEventListener("hashchange", onHashChange);
          window.removeEventListener("firstscene:records-erased", onErased);
        };
      }
      return () => {
        listeners.delete(listener);
      };
    },
    saveAnchor,
    savePreferences,
    owner: environment.owner,
  };
}
