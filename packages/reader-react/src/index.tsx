"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import type {
  Story,
  ReadingAnchor,
  ReaderPrefs,
} from "@firstscene/story-schema";
import { resolvePresentation } from "@firstscene/reader-core";
import { useReadingLayout } from "./use-reading-layout.js";
import { useReaderMotion } from "./use-reader-motion.js";
import { ReadingDocument } from "./reading-document.js";
export { ReadingDocument } from "./reading-document.js";
import { Button, IconButton } from "@firstscene/ui/primitives";
import { ResponsiveAsset, isAssetVariant } from "@firstscene/ui/images";
import type { AssetProps } from "@firstscene/ui/images";
export type AssetMap = Readonly<Record<string, AssetProps>>;
export type StoryReaderProps = {
  story: Story;
  assets: AssetMap;
  preferences: ReaderPrefs;
  initialAnchor?: ReadingAnchor | null;
  /** Snapshot captured before an explicit user preference layout change. */
  layoutAnchor?: ReadingAnchor | null;
  layoutRevision?: number;
  onLayoutRestored?: () => void;
  onAnchorChange?: (anchor: ReadingAnchor) => void;
  onBookmark?: (beatId: string) => void;
  bookmarkedBeatIds?: readonly string[];
  bookmarkDisabled?: boolean;
  onComplete?: () => void;
};
const subscribeReduced = (notify: () => void) => {
  const query = matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const reducedSnapshot = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;
const subscribeMobile = (notify: () => void) => {
  const query = matchMedia("(max-width:1024px)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const mobileSnapshot = () => matchMedia("(max-width:1024px)").matches;
const subscribeHidden = (notify: () => void) => {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
};
const hiddenSnapshot = () => document.visibilityState === "hidden";
const serverTrue = () => true;
const fallback: AssetProps = { variants: [], alt: "", decorative: true };
export function StoryReader({
  story,
  assets,
  preferences,
  initialAnchor,
  layoutAnchor,
  layoutRevision = 0,
  onLayoutRestored,
  onAnchorChange,
  onBookmark,
  bookmarkedBeatIds = [],
  bookmarkDisabled = false,
  onComplete,
}: StoryReaderProps) {
  const stage = useRef<HTMLDivElement>(null);
  const osReduced = useSyncExternalStore(
      subscribeReduced,
      reducedSnapshot,
      serverTrue,
    ),
    mobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, serverTrue),
    hidden = useSyncExternalStore(subscribeHidden, hiddenSnapshot, serverTrue);
  const reduced = preferences.reduceMotion || osReduced || hidden;
  const { root, state, firstScene, bootDone } = useReadingLayout({
    story,
    initialAnchor,
    layoutAnchor,
    layoutRevision,
    onLayoutRestored,
    onAnchorChange,
    preferences,
    mobile,
  });
  const presentation = resolvePresentation(story, state.beatId, {
    ...preferences,
    reduceMotion: reduced,
  });
  const sceneIndex = Math.max(
    0,
    story.scenes.findIndex((s) => s.id === presentation.sceneId),
  );
  const previousScene =
    story.scenes.find((s) => s.id === state.previousSceneId) ?? firstScene;
  useReaderMotion({
    story,
    state,
    preferences,
    sceneId: presentation.sceneId,
    effectEligible: presentation.effectEligible,
    reduced,
    root,
    stage,
    bootDone,
  });
  const currentScene = story.scenes[sceneIndex]!;
  useEffect(() => {
    if (preferences.mode === "plain" || mobile) return;
    const nextScene = story.scenes[sceneIndex + 1];
    const candidates = nextScene
      ? assets[nextScene.backgroundAssetId]?.variants.filter(isAssetVariant)
      : undefined;
    const preferred = candidates?.filter(
      (variant) => variant.format === "avif",
    );
    const variant = (preferred?.length ? preferred : candidates)?.sort(
      (a, b) => Math.abs(a.width - 960) - Math.abs(b.width - 960),
    )[0];
    if (!variant) return;
    const image = new Image();
    image.decoding = "async";
    image.src = variant.path;
    image.decode().catch(() => {});
    return () => image.removeAttribute("src");
  }, [assets, story, sceneIndex, preferences.mode, mobile]);
  const getAsset = (id: string) => assets[id] ?? fallback;
  const portrait = (id: string | null, enabled = true) =>
    id ? (
      <figure className="fs-reader-portrait">
        <ResponsiveAsset
          {...(enabled ? getAsset(id) : fallback)}
          decorative
          alt=""
          aspectRatio="2 / 3"
          sizes="96px"
        />
        <figcaption>{story.characters[0]?.name}</figcaption>
      </figure>
    ) : null;
  return (
    <div
      ref={root}
      className={`fs-reader fs-reader-${preferences.mode}`}
      data-theme={preferences.theme}
      data-mood={presentation.mood}
      data-active-beat={state.beatId}
      data-active-scene={presentation.sceneId}
      data-motion={reduced ? "reduced" : "full"}
      style={
        { "--fs-reading-size": preferences.fontSize + "px" } as CSSProperties
      }
    >
      {preferences.mode === "cinematic" ? (
        <aside className="fs-reader-stage" aria-label="현재 장면">
          <div ref={stage} className="fs-reader-stage-image">
            <div data-scene-layer="previous" aria-hidden="true">
              <ResponsiveAsset
                {...getAsset(previousScene.backgroundAssetId)}
                decorative
                alt=""
                aspectRatio="16 / 10"
              />
            </div>
            <div data-scene-layer="current">
              <ResponsiveAsset
                {...getAsset(currentScene.backgroundAssetId)}
                decorative
                alt=""
                priority={sceneIndex === 0}
                aspectRatio="16 / 10"
              />
            </div>
          </div>
          <div className="fs-reader-stage-caption">
            <span>{String(sceneIndex + 1).padStart(2, "0")}</span>
            <p>{currentScene.title}</p>
          </div>
          {portrait(currentScene.portraitAssetId)}
        </aside>
      ) : null}
      <ReadingDocument
        story={story}
        enhanced
        renderSceneLead={(scene, index) =>
          preferences.mode === "cinematic" ? (
            <div className="fs-reader-mobile-image">
              <ResponsiveAsset
                {...(mobile &&
                (index === sceneIndex || index === sceneIndex + 1)
                  ? getAsset(scene.backgroundAssetId)
                  : fallback)}
                decorative
                alt=""
                priority={index === 0}
                aspectRatio="16 / 10"
              />
              {portrait(
                scene.portraitAssetId,
                mobile && (index === sceneIndex || index === sceneIndex + 1),
              )}
            </div>
          ) : null
        }
        renderBeatAction={
          onBookmark &&
          ((beat) => (
            <IconButton
              className="fs-beat-bookmark"
              label={
                bookmarkedBeatIds.includes(beat.id)
                  ? "이 문장 저장 해제"
                  : "이 문장 저장"
              }
              pressed={bookmarkedBeatIds.includes(beat.id)}
              disabled={bookmarkDisabled}
              icon={bookmarkedBeatIds.includes(beat.id) ? "★" : "☆"}
              onClick={() => onBookmark(beat.id)}
            />
          ))
        }
      >
        {onComplete ? (
          <div className="fs-reader-completion">
            <Button onClick={onComplete}>이 이야기를 다 읽었어요</Button>
          </div>
        ) : null}
      </ReadingDocument>
    </div>
  );
}
