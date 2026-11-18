"use client";
import { FeedbackForm } from "./FeedbackForm";
import type { FeedbackWrite } from "../reading-sync/transport.generated";
import type { FeedbackSendResult } from "../reading-sync/store";
import { Button, StoryCard } from "@firstscene/ui";
import type { StoryCardProps } from "@firstscene/ui";
import type { Story } from "@firstscene/story-schema";
import type { ReaderSnapshot } from "../reader-preferences/local-store";
import type { SyncSnapshot } from "../reading-sync/store";
import { isTransport } from "../reading-sync/validate";
export function CompletionPanel({
  story,
  nextStory,
  local,
  remote,
  onComplete,
  onFeedback,
}: {
  story: Story;
  nextStory: StoryCardProps;
  local: ReaderSnapshot;
  remote: SyncSnapshot;
  onComplete: () => boolean;
  onFeedback: (
    input: FeedbackWrite,
    epoch: string,
  ) => Promise<FeedbackSendResult>;
}) {
  const progress = remote.me?.progress.find((p) => p.storyId === story.id);
  const pending = remote.queue.some(
    (p) =>
      p.key === "progress:" + story.id &&
      isTransport("ProgressWrite", p.body) &&
      p.body.completed,
  );
  const confirmed = Boolean(
    progress?.completed &&
    remote.hydrated &&
    !remote.paused &&
    !["error", "expired"].includes(remote.status),
  );
  const temporary = pending || Boolean(local.anchors[story.id]?.completed);
  const unavailable = !local.ready || !remote.hydrated || remote.paused;
  const message = confirmed
    ? "완독 기록이 서버에 저장됐어요."
    : temporary
      ? local.storageError || remote.storageError
        ? "완독 표시는 이 화면에 유지돼요. 서버 저장 결과를 확인해 주세요."
        : "이 기기에 완독 표시를 임시 저장했어요. 서버 확인 전까지 임시 기록으로 남아요."
      : "마지막 문장까지 함께해 주셔서 고마워요. 완독 표시는 버튼으로 직접 남겨요.";
  const label = confirmed
    ? "✓ 완독 기록 저장됨"
    : temporary
      ? remote.status === "saving"
        ? "완독 기록 저장 중…"
        : "완독 임시 표시됨"
      : "이 이야기를 다 읽었어요";
  return (
    <section
      className="reader-completion-panel"
      aria-labelledby={"completion-" + story.id}
    >
      <h2 id={"completion-" + story.id}>한 편의 이야기를 마치며</h2>
      <p className="reading-note" role="status">
        {message}
      </p>
      <Button
        disabled={unavailable}
        aria-disabled={confirmed || temporary || unavailable}
        aria-busy={pending && remote.status === "saving"}
        variant={confirmed ? "secondary" : "primary"}
        onClick={() => {
          if (!confirmed && !temporary && !unavailable) onComplete();
        }}
      >
        {label}
      </Button>
      <FeedbackForm
        key={story.id + ":" + (remote.me?.session.epoch ?? "none")}
        storyId={story.id}
        remote={remote}
        onSubmit={onFeedback}
      />
      <div className="reader-next-story">
        <h2>다음 이야기</h2>
        <StoryCard {...nextStory} />
      </div>
    </section>
  );
}
