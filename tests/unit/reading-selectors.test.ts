import { describe, expect, it } from "vitest";
import {
  prefsFromDto,
  anchorFromDto,
  desiredBookmarks,
} from "../../apps/web/features/reading-sync/selectors";

describe("read-only sync selectors", () => {
  it("maps transport preferences without touching storage", () => {
    const preferences = {
      mode: "plain",
      effects: "reduced",
      fontSize: 22,
      theme: "dark",
    } as Parameters<typeof prefsFromDto>[0];
    expect(prefsFromDto(preferences)).toEqual({
      mode: "plain",
      reduceMotion: true,
      fontSize: 22,
      theme: "dark",
    });
  });
  it("restores the complete content-bound anchor shape", () => {
    const source = {
      storyId: "post-office",
      contentVersion: 1,
      contentHash: "a".repeat(64),
      sceneId: "mail-s01",
      beatId: "mail-s01-b01",
      fraction: 0.3,
      furthestOrdinal: 3,
      completed: false,
    } as Parameters<typeof anchorFromDto>[0];
    expect(anchorFromDto(source)).toEqual(source);
  });
  it("keeps empty data empty, and applies a pending deletion over server bookmarks", () => {
    expect(desiredBookmarks({ me: null, queue: [] })).toEqual([]);
    const source = {
      storyId: "post-office",
      targetId: "__story__",
      contentVersion: 1,
      createdAt: "2026-11-20T04:00:00.000Z",
    };
    const pending = {
      key: "bookmark:post-office:__story__",
      method: "DELETE",
      path: "/api/v1/bookmarks/post-office/__story__",
      body: {},
      conflicts: 0,
      changedAt: Date.now(),
    } as Parameters<typeof desiredBookmarks>[0]["queue"][number];
    expect(
      desiredBookmarks({
        me: { bookmarks: [source] },
        queue: [pending],
      }),
    ).toEqual([]);
  });
});
