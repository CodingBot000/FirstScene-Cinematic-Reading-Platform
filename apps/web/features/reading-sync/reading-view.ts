import type { ReadingAnchor } from "@firstscene/story-schema";
import { anchorFromDto, desiredBookmarks } from "./selectors";
import type { SyncSnapshot } from "./store";
import { isTransport } from "./validate";

export type { FeedbackWrite } from "./transport.generated";
export type { FeedbackSendResult } from "./store";
export type { ReaderSnapshot } from "./local-store";

export function initialAnchors(progress: SyncSnapshot["initialProgress"]) {
  return new Map(progress?.map((item) => [item.storyId, anchorFromDto(item)]));
}

export function readingView(
  snapshot: SyncSnapshot,
  initial: ReturnType<typeof initialAnchors>,
) {
  const {
    me,
    queue,
    status,
    paused,
    hydrated,
    canRetry,
    notice,
    storageError,
  } = snapshot;
  const confirmed = new Map(
    me?.progress.map((item) => [item.storyId, anchorFromDto(item)]),
  );
  const pendingProgress = new Set<string>();
  const pendingCompletion = new Set<string>();
  for (const item of queue) {
    if (!item.key.startsWith("progress:")) continue;
    const storyId = item.key.slice("progress:".length);
    pendingProgress.add(storyId);
    if (isTransport("ProgressWrite", item.body) && item.body.completed)
      pendingCompletion.add(storyId);
  }
  return {
    status,
    paused,
    hydrated,
    canRetry,
    notice,
    storageError,
    bookmarks: desiredBookmarks(snapshot),
    epoch: me?.session.epoch ?? null,
    hasPendingWrites: queue.length > 0,
    confirmedAnchor: (storyId: string) => confirmed.get(storyId),
    initialAnchor: (storyId: string) => initial.get(storyId),
    pendingCompletion: (storyId: string) => pendingCompletion.has(storyId),
    recentAnchor(storyId: string, local: ReadingAnchor | undefined) {
      const server = confirmed.get(storyId);
      return pendingProgress.has(storyId) ||
        !server ||
        ["offline", "error", "expired"].includes(status)
        ? (local ?? server)
        : server;
    },
  };
}

export type ReadingView = ReturnType<typeof readingView>;

export function saveStatus(status: ReadingView["status"]) {
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
