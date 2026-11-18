"use client";
import { useMemo, useSyncExternalStore } from "react";
import type { Story } from "@firstscene/story-schema";
import { createReaderStore } from "./local-store";
import { useReadingSync } from "../reading-sync/use-reading-sync";
export function useReaderPreferences(story?: Story) {
  const store = useMemo(() => createReaderStore(story), [story]);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const { sync, snapshot: syncSnapshot } = useReadingSync();
  const combined = useMemo(
    () => ({
      ...store,
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
  return { store: combined, snapshot, sync, syncSnapshot };
}
