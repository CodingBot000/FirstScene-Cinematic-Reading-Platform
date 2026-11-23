"use client";
import { Button } from "@firstscene/ui/primitives";
import { useReadingRecords } from "../../../../features/reading-sync/use-reading-records";
import { saveStatus } from "../../../../features/reading-sync/reading-view";
export function StoryActions({
  storyId,
  version,
  firstBeatId,
}: {
  storyId: string;
  version: number;
  firstBeatId: string;
}) {
  const { snapshot: local, syncSnapshot: remote, sync } = useReadingRecords();
  const saved = remote.bookmarks.some(
    (b) => b.storyId === storyId && b.targetId === "__story__",
  );
  const hasProgress = Boolean(
    local.anchors[storyId] || remote.confirmedAnchor(storyId),
  );
  return (
    <>
      <div className="story-actions">
        <a
          className="fs-button fs-primary fs-lg"
          href={"/read/" + storyId + (hasProgress ? "" : "#" + firstBeatId)}
        >
          {hasProgress ? "이어 읽기" : "첫 장면 읽기"}{" "}
          <span aria-hidden="true">→</span>
        </a>
        <Button
          variant="secondary"
          disabled={!local.ready || remote.paused}
          aria-pressed={saved}
          onClick={() =>
            sync.setBookmark(storyId, version, "__story__", !saved)
          }
        >
          {saved ? "★ 작품 저장됨" : "☆ 작품 저장"}
        </Button>
        {hasProgress ? (
          <a
            className="fs-text-link"
            href={"/read/" + storyId + "#" + firstBeatId}
          >
            처음부터 읽기
          </a>
        ) : null}
      </div>
      <p className="reading-note" role="status">
        {remote.notice ??
          (remote.hasPendingWrites
            ? saveStatus(remote.status)
            : "저장한 작품은 이 브라우저의 내 서재에서 확인할 수 있어요.")}
      </p>
    </>
  );
}
