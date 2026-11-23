import type { ReaderPrefs, ReadingAnchor } from "@firstscene/story-schema";
import type {
  Me,
  PreferencesWrite,
  Progress,
  Bookmark,
} from "./transport.generated";
import type { Pending } from "./outbox";

/** Read-only projections; no storage, network or mutation lifecycle access. */
export const prefsFromDto = (
  p: Pick<PreferencesWrite, "mode" | "effects" | "fontSize" | "theme">,
): ReaderPrefs => ({
  mode: p.mode,
  reduceMotion: p.effects === "reduced",
  fontSize: p.fontSize,
  theme: p.theme,
});
export const anchorFromDto = (p: Progress): ReadingAnchor => ({
  storyId: p.storyId,
  contentVersion: p.contentVersion,
  contentHash: p.contentHash,
  sceneId: p.sceneId,
  beatId: p.beatId,
  fraction: p.fraction,
  furthestOrdinal: p.furthestOrdinal,
  completed: p.completed,
});

/** Optimistic view: pending local bookmark writes override server state. */
export function desiredBookmarks(snapshot: {
  me: Pick<Me, "bookmarks"> | null;
  queue: readonly Pending[];
}): Bookmark[] {
  const bookmarks = new Map(
    (snapshot.me?.bookmarks ?? []).map((bookmark) => [
      bookmark.storyId + ":" + bookmark.targetId,
      bookmark,
    ]),
  );
  for (const item of snapshot.queue) {
    if (!item.key.startsWith("bookmark:")) continue;
    const [, storyId, targetId] = item.key.split(":") as [
      string,
      string,
      string,
    ];
    const key = storyId + ":" + targetId;
    if (item.method === "DELETE") bookmarks.delete(key);
    else if ("contentVersion" in item.body)
      bookmarks.set(key, {
        storyId,
        targetId,
        contentVersion: item.body.contentVersion,
        createdAt: new Date(item.changedAt).toISOString(),
      });
  }
  return [...bookmarks.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
