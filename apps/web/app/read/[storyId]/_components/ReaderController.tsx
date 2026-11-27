"use client";
import { useReadingRecords } from "../../../../features/reading-sync/use-reading-records";
import { PreferenceControls } from "../../../../features/reader-preferences/PreferenceControls";
import {
  Component,
  memo,
  useCallback,
  useLayoutEffect,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { ReadingDocument, StoryReader } from "@firstscene/reader-react";
import type { AssetMap } from "@firstscene/reader-react";
import { Button, ErrorState } from "@firstscene/ui/primitives";
import { Dialog } from "@firstscene/ui/overlays";
import { ReadingToolbar } from "@firstscene/ui/reader-controls";
import type { Story, ReadingAnchor } from "@firstscene/story-schema";
import type { StoryCardProps } from "@firstscene/ui/cards";
import { CompletionPanel } from "../../../../features/completion/CompletionPanel";
import { ReaderFrame } from "./ReaderFrame";
import type { AssetProps } from "@firstscene/ui/images";
import { StoryCoverTransition } from "../../../../components/StoryCoverTransition";
import { saveStatus } from "../../../../features/reading-sync/reading-view";

const ReaderStage = memo(StoryReader);

class ReaderBoundary extends Component<
  { story: Story; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <>
        <ErrorState
          title="연출을 불러오지 못했어요."
          message="아래의 일반 본문으로 계속 읽을 수 있어요."
          onRetry={() => this.setState({ failed: false })}
        />
        <ReadingDocument story={this.props.story} />
      </>
    );
  }
}
export function ReaderController({
  story,
  assets,
  nextStory,
  openingCover,
}: {
  story: Story;
  assets: AssetMap;
  nextStory: StoryCardProps;
  openingCover: AssetProps;
}) {
  const { store, snapshot, sync, syncSnapshot } = useReadingRecords(story);
  const prefs = snapshot.preferences;
  const writesPaused = syncSnapshot.paused;
  // The reader uses membership only. Keep identities stable across sync ACKs
  // that replace bookmark DTOs or their timestamps without changing the set.
  const bookmarkIds = syncSnapshot.bookmarks
    .filter((b) => b.storyId === story.id)
    .map((b) => b.targetId)
    .sort()
    .join(" ");
  const bookmarked = useMemo(
    () => (bookmarkIds ? bookmarkIds.split(" ") : []),
    [bookmarkIds],
  );
  const [dialog, setDialog] = useState<"settings" | "toc" | null>(null),
    [sceneIndex, setSceneIndex] = useState(0);
  const [layoutAnchor, setLayoutAnchor] = useState<ReadingAnchor | null>(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [interacted, setInteracted] = useState(false);
  const [remoteRestored, setRemoteRestored] = useState(false);
  const settingsTarget = useRef<ReadingAnchor | null>(null);
  const tocDestination = useRef<string | null>(null);
  const latest = useRef<ReadingAnchor | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null),
    tocButton = useRef<HTMLButtonElement>(null);
  const remoteInitial = syncSnapshot.initialAnchor(story.id);
  useEffect(() => {
    if (
      syncSnapshot.hydrated &&
      !writesPaused &&
      latest.current &&
      (!remoteInitial || interacted)
    )
      store.saveAnchor(latest.current);
  }, [syncSnapshot.hydrated, remoteInitial, interacted, store, writesPaused]);
  useLayoutEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    const manual = () => setInteracted(true);
    const key = (event: KeyboardEvent) => {
      if (
        [
          "ArrowDown",
          "ArrowUp",
          "PageDown",
          "PageUp",
          "Home",
          "End",
          " ",
        ].includes(event.key)
      )
        manual();
    };
    window.addEventListener("wheel", manual, { passive: true });
    window.addEventListener("touchmove", manual, { passive: true });
    window.addEventListener("keydown", key);
    return () => {
      history.scrollRestoration = previous;
      window.removeEventListener("wheel", manual);
      window.removeEventListener("touchmove", manual);
      window.removeEventListener("keydown", key);
    };
  }, []);
  const anchorChanged = useCallback(
    (anchor: ReadingAnchor) => {
      latest.current = anchor;
      if (snapshot.ready && syncSnapshot.hydrated && !writesPaused)
        store.saveAnchor(anchor);
      const index = story.scenes.findIndex((s) => s.id === anchor.sceneId);
      setSceneIndex((old) => (old === index ? old : index));
    },
    [story, store, snapshot.ready, syncSnapshot.hydrated, writesPaused],
  );
  const renderOpeningArtwork = useCallback(
    (artwork: ReactNode) => (
      <StoryCoverTransition storyId={story.id}>{artwork}</StoryCoverTransition>
    ),
    [story.id],
  );
  const settingsOpen = dialog === "settings";
  const onLayoutRestored = useCallback(() => {
    setRemoteRestored(true);
    if (!settingsOpen) setLayoutAnchor(null);
  }, [settingsOpen]);
  const onBookmark = useCallback(
    (beatId: string) =>
      sync.setBookmark(
        story.id,
        story.version,
        beatId,
        !bookmarked.includes(beatId),
      ),
    [sync, story.id, story.version, bookmarked],
  );
  return (
    <ReaderFrame theme={prefs.theme} ready={snapshot.ready}>
      <ReadingToolbar
        settingsButtonRef={settingsButton}
        tocButtonRef={tocButton}
        title={story.title}
        sceneIndex={sceneIndex + 1}
        sceneCount={story.scenes.length}
        saveStatus={
          snapshot.storageError
            ? "임시 저장을 사용할 수 없어요"
            : saveStatus(syncSnapshot.status)
        }
        onBack={() => {
          location.href = "/stories/" + story.id;
        }}
        onSettings={() => {
          settingsTarget.current = latest.current;
          setLayoutAnchor(latest.current);
          setDialog("settings");
        }}
        onToc={() => {
          tocDestination.current = null;
          setDialog("toc");
        }}
      />
      <main id="main">
        {snapshot.notice ? (
          <p className="reader-notice">{snapshot.notice}</p>
        ) : null}
        {syncSnapshot.notice ? (
          <p className="reader-notice" role="status">
            {syncSnapshot.notice}
          </p>
        ) : null}
        {syncSnapshot.canRetry ? (
          <div className="reader-notice">
            <Button variant="secondary" onClick={sync.retry}>
              저장 상태 다시 확인
            </Button>
          </div>
        ) : null}
        {syncSnapshot.status === "delete-error" ? (
          <p className="reader-notice">
            <a href="/settings" className="fs-text-link">
              설정에서 기록 삭제 다시 시도하기 →
            </a>
          </p>
        ) : null}
        <ReaderBoundary story={story}>
          <ReaderStage
            key={story.contentHash + (snapshot.ready ? ":ready" : ":ssr")}
            story={story}
            assets={assets}
            sceneTransition="slide"
            openingCover={openingCover}
            renderOpeningArtwork={renderOpeningArtwork}
            preferences={prefs}
            initialAnchor={snapshot.initialAnchor}
            layoutAnchor={
              layoutAnchor ??
              (snapshot.ready &&
              !remoteRestored &&
              !interacted &&
              !location.hash
                ? remoteInitial
                  ? remoteInitial
                  : null
                : null)
            }
            layoutRevision={
              layoutRevision + (syncSnapshot.hydrated && remoteInitial ? 1 : 0)
            }
            onLayoutRestored={onLayoutRestored}
            onAnchorChange={anchorChanged}
            bookmarkedBeatIds={bookmarked}
            bookmarkDisabled={!snapshot.ready || writesPaused}
            onBookmark={onBookmark}
          />
        </ReaderBoundary>
        <CompletionPanel
          story={story}
          nextStory={nextStory}
          local={snapshot}
          remote={syncSnapshot}
          onFeedback={sync.sendFeedback}
          onComplete={() => {
            const scene = story.scenes.at(-1)!,
              beat = scene.beats.at(-1)!;
            return store.completeAnchor({
              storyId: story.id,
              contentVersion: story.version,
              contentHash: story.contentHash,
              sceneId: scene.id,
              beatId: beat.id,
              fraction: 1,
              furthestOrdinal:
                story.scenes.reduce((sum, s) => sum + s.beats.length, 0) - 1,
              completed: true,
            });
          }}
        />
      </main>
      <Dialog
        returnFocusTo={settingsButton}
        open={dialog === "settings"}
        onOpenChange={(open) => {
          setDialog(open ? "settings" : null);
          if (!open) setLayoutAnchor(null);
        }}
        title="읽기 설정"
        description="설정은 바로 반영되고 이 기기에 임시 저장돼요."
        onCloseAutoFocus={() => {
          if (settingsTarget.current) {
            setLayoutAnchor(settingsTarget.current);
            setLayoutRevision((value) => value + 1);
          }
        }}
      >
        <fieldset className="fs-fieldset" disabled={writesPaused}>
          <legend className="fs-sr-only">읽기 환경</legend>
          <PreferenceControls
            preferences={prefs}
            onChange={store.savePreferences}
          />
        </fieldset>
        {writesPaused && syncSnapshot.notice ? (
          <>
            <p className="reading-note" role="status">
              {syncSnapshot.notice}
            </p>
            <a href="/settings" className="fs-text-link">
              기록 삭제 상태 확인하기 →
            </a>
          </>
        ) : null}
        {snapshot.notice ? (
          <p className="reading-note" role="status">
            {snapshot.notice}
          </p>
        ) : null}
      </Dialog>
      <Dialog
        returnFocusTo={tocButton}
        open={dialog === "toc"}
        onOpenChange={(open) => setDialog(open ? "toc" : null)}
        title="여섯 장면"
        description="장면을 선택하면 해당 제목으로 이동해요."
        onCloseAutoFocus={(event) => {
          const id = tocDestination.current;
          if (!id) return;
          event.preventDefault();
          tocDestination.current = null;
          const target = document.getElementById(id);
          target?.focus({ preventScroll: true });
          target?.scrollIntoView({ behavior: "instant", block: "start" });
        }}
      >
        <ol className="reader-toc-list">
          {story.scenes.map((scene, index) => (
            <li key={scene.id}>
              <a
                href={"#" + scene.beats[0]!.id}
                onClick={(event) => {
                  event.preventDefault();
                  tocDestination.current = scene.id;
                  history.pushState(
                    history.state,
                    "",
                    "#" + scene.beats[0]!.id,
                  );
                  setDialog(null);
                }}
              >
                {String(index + 1).padStart(2, "0")} {scene.title}
              </a>
            </li>
          ))}
        </ol>
      </Dialog>
    </ReaderFrame>
  );
}
