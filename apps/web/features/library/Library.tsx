"use client";
import { useRef } from "react";
import {
  Button,
  EmptyState,
  ErrorState,
  Progress,
  ResponsiveAsset,
} from "@firstscene/ui";
import type { AssetProps } from "@firstscene/ui";
import type { Story } from "@firstscene/story-schema";
import { useReaderPreferences } from "../reader-preferences/use-reader-preferences";
import { desiredBookmarks, anchorFromDto } from "../reading-sync/store";
import { saveStatus } from "../reading-sync/use-reading-sync";
export type LibraryStory = { story: Story; cover: AssetProps };
export function Library({ catalog }: { catalog: readonly LibraryStory[] }) {
  const {
    snapshot: local,
    syncSnapshot: remote,
    sync,
  } = useReaderPreferences();
  const quoteHeading = useRef<HTMLHeadingElement>(null),
    storyHeading = useRef<HTMLHeadingElement>(null);
  const bookmarks = desiredBookmarks(remote);
  const savedStories = bookmarks.filter((b) => b.targetId === "__story__");
  const quotes = bookmarks.filter((b) => b.targetId !== "__story__");
  const recent = catalog.flatMap(({ story, cover }) => {
    const server = remote.me?.progress.find((p) => p.storyId === story.id);
    const pending = remote.queue.some((i) => i.key === "progress:" + story.id);
    const anchor =
      pending ||
      !server ||
      ["offline", "error", "expired"].includes(remote.status)
        ? (local.anchors[story.id] ?? (server ? anchorFromDto(server) : null))
        : anchorFromDto(server);
    return anchor ? [{ story, cover, anchor }] : [];
  });
  function remove(
    storyId: string,
    targetId: string,
    version: number,
    nextKey: string | null,
    heading: typeof quoteHeading,
  ) {
    if (!sync.setBookmark(storyId, version, targetId, false)) return;
    requestAnimationFrame(() => {
      (nextKey
        ? [
            ...document.querySelectorAll<HTMLButtonElement>(
              "[data-remove-key]",
            ),
          ].find((button) => button.dataset.removeKey === nextKey)
        : heading.current
      )?.focus();
    });
  }
  const hasRecords = Boolean(recent.length || bookmarks.length);
  if (!remote.hydrated && !hasRecords)
    return (
      <div aria-busy="true">
        <p role="status">이 브라우저의 기록을 확인하고 있어요.</p>
        <div className="library-skeleton" aria-hidden="true" />
        <noscript>
          <p>
            독서 기록을 확인하려면 JavaScript를 켜 주세요. 이야기는 설정 없이도
            읽을 수 있어요.
          </p>
          <a href="/discover">이야기 탐색</a>
        </noscript>
      </div>
    );
  return (
    <>
      <p className="reading-note" role="status">
        {remote.notice ??
          (!hasRecords && remote.status === "local"
            ? "아직 저장된 독서 기록이 없어요."
            : saveStatus(remote.status))}
        {!remote.me && hasRecords
          ? " · 이 기기의 임시 기록을 사용하고 있어요."
          : ""}
      </p>
      {remote.canRetry ? (
        <ErrorState
          title="서버 기록을 확인하지 못했어요."
          message="이 기기의 기록은 아래에서 확인할 수 있어요. 연결 후 다시 시도해 주세요."
          onRetry={sync.retry}
        />
      ) : null}
      {["expired", "delete-error"].includes(remote.status) ? (
        <p>
          <a href="/settings" className="fs-text-link">
            설정에서 기록 정리하기 →
          </a>
        </p>
      ) : null}
      {!hasRecords ? (
        <EmptyState
          title="아직 남긴 독서 기록이 없어요."
          description="이야기를 읽거나 마음에 남는 문장을 저장하면 여기에 모여요."
          action={
            <a href="/discover" className="fs-text-link">
              이야기 만나기 →
            </a>
          }
        />
      ) : null}
      <div hidden={!hasRecords}>
        <section className="library-section" aria-labelledby="recent-title">
          <h2 id="recent-title">최근 읽기</h2>
          {recent.length ? (
            <ul className="library-recent">
              {recent.map(({ story, cover, anchor }) => {
                const scene = story.scenes.find((s) => s.id === anchor.sceneId);
                const count = story.scenes.reduce(
                  (sum, s) => sum + s.beats.length,
                  0,
                );
                const percent = anchor.completed
                  ? 100
                  : Math.min(
                      99,
                      Math.round(((anchor.furthestOrdinal + 1) / count) * 100),
                    );
                return (
                  <li key={story.id}>
                    <a href={"/read/" + story.id} className="library-cover">
                      <ResponsiveAsset {...cover} aspectRatio="3 / 4" />
                    </a>
                    <div>
                      <p className="genre">
                        {anchor.completed
                          ? "완독한 이야기"
                          : "이어 읽는 이야기"}
                      </p>
                      <h3>
                        <a href={"/stories/" + story.id}>{story.title}</a>
                      </h3>
                      <p>{scene?.title ?? "새 첫 장면"}</p>
                      <Progress
                        value={percent}
                        max={100}
                        label="최대로 읽은 위치 (추정)"
                      />
                      <p className="reading-note">
                        최대로 읽은 위치 약 {percent}%
                      </p>
                      <a href={"/read/" + story.id} className="fs-text-link">
                        이어 읽기 →
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="reading-note">아직 읽기 위치가 없어요.</p>
          )}
        </section>
        <section
          className="library-section"
          aria-labelledby="saved-stories-title"
        >
          <h2 id="saved-stories-title" tabIndex={-1} ref={storyHeading}>
            저장한 작품
          </h2>
          {savedStories.length ? (
            <ul className="library-stories">
              {savedStories.map((b, index) => {
                const info = catalog.find((c) => c.story.id === b.storyId);
                if (!info)
                  return (
                    <li key={b.storyId}>
                      <p>현재 제공하지 않는 이야기</p>
                      <Button
                        disabled={remote.paused}
                        onClick={() =>
                          remove(
                            b.storyId,
                            b.targetId,
                            b.contentVersion,
                            null,
                            storyHeading,
                          )
                        }
                      >
                        기록에서 삭제
                      </Button>
                    </li>
                  );
                const key = b.storyId + ":" + b.targetId;
                const next = savedStories[index + 1];
                return (
                  <li key={key}>
                    <a href={"/stories/" + b.storyId} className="library-cover">
                      <ResponsiveAsset {...info.cover} aspectRatio="3 / 4" />
                    </a>
                    <div>
                      <h3>
                        <a href={"/stories/" + b.storyId}>{info.story.title}</a>
                      </h3>
                      <a
                        href={"/stories/" + b.storyId}
                        className="fs-text-link"
                      >
                        작품 열기 →
                      </a>
                      <Button
                        variant="ghost"
                        disabled={remote.paused}
                        data-remove-key={key}
                        onClick={() =>
                          remove(
                            b.storyId,
                            b.targetId,
                            b.contentVersion,
                            next ? next.storyId + ":" + next.targetId : null,
                            storyHeading,
                          )
                        }
                        aria-label={info.story.title + " 저장 해제"}
                      >
                        저장 해제
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="reading-note">
              저장한 작품이 없어요. 작품 소개에서 별을 눌러 보관할 수 있어요.
            </p>
          )}
        </section>
        <section
          className="library-section"
          aria-labelledby="saved-quotes-title"
        >
          <h2 id="saved-quotes-title" tabIndex={-1} ref={quoteHeading}>
            저장한 문장
          </h2>
          {quotes.length ? (
            <ol className="library-quotes">
              {quotes.map((b, index) => {
                const info = catalog.find((c) => c.story.id === b.storyId);
                const scene = info?.story.scenes.find((s) =>
                  s.beats.some((beat) => beat.id === b.targetId),
                );
                const beat = scene?.beats.find(
                  (beat) => beat.id === b.targetId,
                );
                const key = b.storyId + ":" + b.targetId;
                const next = quotes[index + 1];
                return (
                  <li key={key} data-bookmark={b.targetId}>
                    <p className="genre">
                      {info?.story.title ?? "이전 이야기"} ·{" "}
                      {scene?.title ?? "변경된 문장"}
                    </p>
                    <blockquote>
                      {beat?.text ??
                        "이 문장은 갱신됐어요. 작품의 첫 장면에서 다시 읽을 수 있어요."}
                    </blockquote>
                    <div className="library-actions">
                      <a
                        href={
                          "/read/" + b.storyId + (beat ? "#" + b.targetId : "")
                        }
                        className="fs-text-link"
                      >
                        {beat ? "문장 열기 →" : "이야기 열기 →"}
                      </a>
                      <Button
                        variant="ghost"
                        disabled={remote.paused}
                        data-remove-key={key}
                        onClick={() =>
                          remove(
                            b.storyId,
                            b.targetId,
                            b.contentVersion,
                            next ? next.storyId + ":" + next.targetId : null,
                            quoteHeading,
                          )
                        }
                        aria-label={
                          (scene?.title ?? "변경된 문장") + "의 문장 저장 해제"
                        }
                      >
                        저장 해제
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="reading-note">
              마음에 남는 문장 옆의 별을 누르면 여기에 모여요.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
