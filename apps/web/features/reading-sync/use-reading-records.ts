"use client";
import { useMemo, useSyncExternalStore } from "react";
import type { Story } from "@firstscene/story-schema";
import { initialAnchors, readingView } from "./reading-view";
import { createReaderStore } from "./local-store";
import { useReadingSync } from "./use-reading-sync";
export function useReadingRecords(story?: Story) {
  const store = useMemo(() => createReaderStore(story), [story]);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const { sync, snapshot: syncSnapshot } = useReadingSync();
  const combined = useMemo(
    () => ({
      savePreferences: (
        preferences: Parameters<typeof store.savePreferences>[0],
      ) => {
        if (!sync.canWriteLocal()) return;
        sync.savePreferences(preferences);
        store.savePreferences(preferences);
      },
      saveAnchor: (anchor: Parameters<typeof store.saveAnchor>[0]) => {
        if (!sync.canWriteLocal()) return;
        if (store.saveAnchor(anchor)) sync.saveAnchor(anchor, store.owner());
      },
      completeAnchor: (anchor: Parameters<typeof store.saveAnchor>[0]) => {
        if (
          !sync.canWriteLocal() ||
          !store.saveAnchor({ ...anchor, completed: true })
        )
          return false;
        return sync.completeAnchor(
          { ...anchor, completed: true },
          store.owner(),
        );
      },
    }),
    [store, sync],
  );
  const initialProgress = syncSnapshot.initialProgress;
  const initial = useMemo(
    () => initialAnchors(initialProgress),
    [initialProgress],
  );
  const view = useMemo(
    () => readingView(syncSnapshot, initial),
    [syncSnapshot, initial],
  );
  const actions = useMemo(
    () => ({
      retry: sync.retry,
      erase: sync.erase,
      resumeAfterFailedDeletion: sync.resumeAfterFailedDeletion,
      setBookmark: sync.setBookmark,
      sendFeedback: sync.sendFeedback,
    }),
    [sync],
  );
  return { store: combined, snapshot, sync: actions, syncSnapshot: view };
}
