"use client";
import { useEffect, useSyncExternalStore } from "react";
import { createSyncStore } from "./store";
import { SYNC_KEY, RESET_KEY, PREFERENCES_INTENT_KEY } from "./outbox";
let fallbackLock = Promise.resolve();
let channel: BroadcastChannel | null = null;
export const readingSync = createSyncStore({
  allowCreation: () => Boolean(navigator.locks),
  storage: () => localStorage,
  fetch: (...args) => fetch(...args),
  online: () => navigator.onLine,
  foreground: () => document.visibilityState !== "hidden",
  uuid: () => crypto.randomUUID(),
  now: () => Date.now(),
  random: () => Math.random(),
  lock: async (action) => {
    if (navigator.locks)
      return navigator.locks.request(
        "firstscene:session-and-writes:v1",
        action,
      );
    const previous = fallbackLock;
    let release!: () => void;
    fallbackLock = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await action();
    } finally {
      release();
    }
  },
  stateLock: async (action) =>
    navigator.locks
      ? navigator.locks.request("firstscene:outbox-storage:v1", action)
      : action(),
  changed: () => {
    window.dispatchEvent(new Event("firstscene:preferences"));
    const erased = readingSync.getSnapshot().status === "deleted";
    if (erased) window.dispatchEvent(new Event("firstscene:records-erased"));
    channel?.postMessage({ type: erased ? "erased" : "changed" });
  },
});
function externalChange() {
  readingSync.external();
  if (readingSync.getSnapshot().status === "deleted")
    window.dispatchEvent(new Event("firstscene:records-erased"));
}
let users = 0;
function attach() {
  if (users++ > 0) return;
  try {
    channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("firstscene:changes:v1")
        : null;
    if (channel) channel.onmessage = externalChange;
  } catch {
    channel = null;
  }
  const online = () => readingSync.onlineChanged();
  const storage = (event: StorageEvent) => {
    if ([SYNC_KEY, RESET_KEY, PREFERENCES_INTENT_KEY].includes(event.key ?? ""))
      externalChange();
  };
  const hidden = () => {
    if (document.visibilityState === "hidden") void readingSync.flush(true);
    else readingSync.external();
  };
  const hide = () => {
    void readingSync.flush(true);
  };
  window.addEventListener("online", online);
  window.addEventListener("offline", online);
  window.addEventListener("storage", storage);
  window.addEventListener("pagehide", hide);
  document.addEventListener("visibilitychange", hidden);
  detach = () => {
    readingSync.stop();
    channel?.close();
    channel = null;
    window.removeEventListener("online", online);
    window.removeEventListener("offline", online);
    window.removeEventListener("storage", storage);
    window.removeEventListener("pagehide", hide);
    document.removeEventListener("visibilitychange", hidden);
  };
  readingSync.beginNew();
  readingSync.start();
}
let detach = () => {};
export function useReadingSync() {
  const snapshot = useSyncExternalStore(
    readingSync.subscribe,
    readingSync.getSnapshot,
    readingSync.getServerSnapshot,
  );
  useEffect(() => {
    attach();
    return () => {
      if (--users === 0) detach();
    };
  }, []);
  return { sync: readingSync, snapshot };
}
export function saveStatus(
  status: ReturnType<typeof readingSync.getSnapshot>["status"],
) {
  return {
    loading: "저장 상태 확인 중",
    local: "이 기기에 임시 저장 중",
    saving: "서버에 저장 중",
    saved: "서버에 저장됨",
    offline: "오프라인 · 임시 저장 중",
    error: "저장 주의 · 임시 기록 유지",
    expired: "세션 만료 · 임시 기록 유지",
    deleting: "기록 삭제 중",
    "delete-error": "삭제 실패 · 저장 중단",
    deleted: "기록 삭제됨",
  }[status];
}
