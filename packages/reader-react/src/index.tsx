"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { CSSProperties } from "react";
import type {
  Story,
  ReadingAnchor,
  ReaderPrefs,
} from "@firstscene/story-schema";
import {
  anchorFromLayout,
  resolvePresentation,
  restoreAnchor,
  scrollTopForAnchor,
  storyBeats,
  planTextEffect,
} from "@firstscene/reader-core";
import type { BeatRect } from "@firstscene/reader-core";
import { ResponsiveAsset, IconButton, Button } from "@firstscene/ui";
import type { AssetProps } from "@firstscene/ui";
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
const playedByContent = new Map<string, Set<string>>();
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
  const root = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null),
    layout = useRef<BeatRect[]>([]),
    latest = useRef<ReadingAnchor | null>(null),
    callback = useRef(onAnchorChange),
    bootDone = useRef(false),
    manualNavigation = useRef(0),
    suppressNextTransition = useRef(true),
    pendingLayoutAnchor = useRef<{
      anchor: ReadingAnchor;
      epoch: number;
    } | null>(null),
    effectCleanup = useRef<() => void>(() => {});
  const firstScene = story.scenes[0]!,
    firstBeat = firstScene.beats[0]!;
  const [state, setState] = useState({
    beatId: firstBeat.id,
    sceneId: firstScene.id,
    previousSceneId: firstScene.id,
    animateScene: false,
  });
  const osReduced = useSyncExternalStore(
      subscribeReduced,
      reducedSnapshot,
      serverTrue,
    ),
    mobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, serverTrue),
    hidden = useSyncExternalStore(subscribeHidden, hiddenSnapshot, serverTrue);
  const reduced = preferences.reduceMotion || osReduced || hidden;
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
  const measure = useCallback(() => {
    if (!root.current) return;
    layout.current = Array.from(
      root.current.querySelectorAll<HTMLElement>("[data-beat]"),
    ).map((element, ordinal) => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.id,
        top: rect.top + scrollY,
        bottom: rect.bottom + scrollY,
        ordinal,
      };
    });
  }, []);
  const restore = useCallback(
    (anchor: ReadingAnchor) => {
      suppressNextTransition.current = true;
      measure();
      const resolved = restoreAnchor(story, anchor);
      const rect = layout.current.find((r) => r.id === resolved.anchor.beatId);
      if (rect) {
        scrollTo({
          top: scrollTopForAnchor(
            rect,
            resolved.anchor.fraction,
            innerHeight,
            document.documentElement.scrollHeight,
          ),
          behavior: "instant",
        });
        latest.current = resolved.anchor;
        if (bootDone.current) callback.current?.(resolved.anchor);
      }
    },
    [measure, story],
  );
  useLayoutEffect(() => {
    callback.current = onAnchorChange;
  }, [onAnchorChange]);
  useEffect(() => {
    const all = storyBeats(story);
    let frame = 0,
      lastNotify = 0;
    let lastNotifiedBeat = "";
    let disposed = false;
    function update() {
      frame = 0;
      if (!layout.current.length) measure();
      const anchor = anchorFromLayout(
        story,
        layout.current,
        scrollY + innerHeight * 0.42,
        latest.current ?? undefined,
      );
      const beatChanged = lastNotifiedBeat !== anchor.beatId;
      latest.current = anchor;
      const animateScene = bootDone.current && !suppressNextTransition.current;
      suppressNextTransition.current = false;
      setState((old) =>
        old.beatId === anchor.beatId
          ? old
          : {
              beatId: anchor.beatId,
              sceneId: anchor.sceneId,
              previousSceneId:
                old.sceneId === anchor.sceneId
                  ? old.previousSceneId
                  : old.sceneId,
              animateScene:
                old.sceneId === anchor.sceneId
                  ? old.animateScene
                  : animateScene,
            },
      );
      if (
        bootDone.current &&
        (beatChanged || performance.now() - lastNotify > 200)
      ) {
        lastNotify = performance.now();
        lastNotifiedBeat = anchor.beatId;
        callback.current?.(anchor);
      }
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const remeasure = () => {
      measure();
      schedule();
    };
    const flush = () => {
      if (bootDone.current) {
        if (pendingLayoutAnchor.current?.epoch === manualNavigation.current) {
          latest.current = pendingLayoutAnchor.current.anchor;
          callback.current?.(pendingLayoutAnchor.current.anchor);
          return;
        }
        measure();
        const anchor = anchorFromLayout(
          story,
          layout.current,
          scrollY + innerHeight * 0.42,
          latest.current ?? undefined,
        );
        latest.current = anchor;
        callback.current?.(anchor);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const manual = () => {
      pendingLayoutAnchor.current = null;
      manualNavigation.current++;
      bootDone.current = true;
    };
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
        ].includes(event.key) &&
        !(event.target instanceof HTMLInputElement)
      )
        manual();
    };
    const onHashChange = () => {
      if (!location.hash) return;
      let id = location.hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        id = "invalid-hash";
      }
      const entry = all.find((item) => item.beat.id === id) ?? all[0]!;
      manualNavigation.current++;
      bootDone.current = true;
      playedByContent.get(story.contentHash)?.add(entry.beat.id);
      restore({
        storyId: story.id,
        contentVersion: story.version,
        contentHash: story.contentHash,
        sceneId: entry.scene.id,
        beatId: entry.beat.id,
        fraction: 0,
        furthestOrdinal: Math.max(
          entry.ordinal,
          latest.current?.furthestOrdinal ?? 0,
        ),
        completed: latest.current?.completed ?? false,
      });
      schedule();
    };
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", remeasure);
    addEventListener("wheel", manual, { passive: true });
    addEventListener("touchmove", manual, { passive: true });
    addEventListener("keydown", key);
    addEventListener("pagehide", flush);
    addEventListener("hashchange", onHashChange);
    document.addEventListener("visibilitychange", onVisibility);
    const observer = new ResizeObserver(remeasure);
    if (root.current) observer.observe(root.current);
    const epoch = manualNavigation.current;
    let saved = initialAnchor;
    let hash = location.hash.slice(1);
    try {
      hash = decodeURIComponent(hash);
    } catch {
      hash = "invalid-hash";
    }
    const linked = all.find((entry) => entry.beat.id === hash);
    if (hash && !linked) saved = null;
    if (linked)
      saved = {
        storyId: story.id,
        contentVersion: story.version,
        contentHash: story.contentHash,
        sceneId: linked.scene.id,
        beatId: linked.beat.id,
        fraction: 0,
        furthestOrdinal: Math.max(linked.ordinal, saved?.furthestOrdinal ?? 0),
        completed: saved?.completed ?? false,
      };
    let played = playedByContent.get(story.contentHash);
    if (!played) {
      played = new Set();
      playedByContent.set(story.contentHash, played);
      if (playedByContent.size > 8)
        playedByContent.delete(playedByContent.keys().next().value!);
    }
    played.add(saved?.beatId ?? firstBeat.id);
    Promise.resolve(document.fonts?.ready)
      .catch(() => {})
      .then(() => {
        if (disposed) return;
        measure();
        suppressNextTransition.current = true;
        const pending = pendingLayoutAnchor.current;
        const target =
          pending && pending.epoch === manualNavigation.current
            ? pending.anchor
            : saved;
        if (manualNavigation.current === epoch && target) restore(target);
        bootDone.current = true;
        if (target && manualNavigation.current === epoch)
          callback.current?.(target);
        schedule();
      });
    return () => {
      if (bootDone.current && latest.current)
        callback.current?.(latest.current);
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      removeEventListener("scroll", schedule);
      removeEventListener("resize", remeasure);
      removeEventListener("wheel", manual);
      removeEventListener("touchmove", manual);
      removeEventListener("keydown", key);
      removeEventListener("pagehide", flush);
      removeEventListener("hashchange", onHashChange);
      document.removeEventListener("visibilitychange", onVisibility);
      effectCleanup.current();
    };
    // A late persistence response must not move an already-active reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story, measure, restore, firstBeat.id]);
  useLayoutEffect(() => {
    const anchor = layoutAnchor ?? latest.current;
    if (layoutAnchor && !bootDone.current) {
      pendingLayoutAnchor.current = {
        anchor: layoutAnchor,
        epoch: manualNavigation.current,
      };
      return;
    }
    if (anchor && bootDone.current) {
      const epoch = manualNavigation.current;
      pendingLayoutAnchor.current = { anchor, epoch };
      let settledFrame = 0;
      const frame = requestAnimationFrame(() => {
        if (manualNavigation.current === epoch) {
          restore(anchor);
          onLayoutRestored?.();
          settledFrame = requestAnimationFrame(() => {
            pendingLayoutAnchor.current = null;
          });
        }
      });
      return () => {
        cancelAnimationFrame(frame);
        cancelAnimationFrame(settledFrame);
        pendingLayoutAnchor.current = null;
      };
    }
    // The captured value is applied only with a layout change; clearing it on dialog close must not cancel the pending restoration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.fontSize, preferences.mode, mobile, restore, layoutRevision]);
  useEffect(() => {
    if (
      preferences.mode === "plain" ||
      reduced ||
      !stage.current ||
      !state.animateScene
    )
      return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    import("./motion.js")
      .then((adapter) => {
        if (!disposed && stage.current)
          cleanup = adapter.transitionScene(stage.current, false);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [presentation.sceneId, preferences.mode, reduced, state.animateScene]);
  useEffect(() => {
    effectCleanup.current();
    const beat = storyBeats(story).find(
      (entry) => entry.beat.id === state.beatId,
    )?.beat;
    if (!beat || !bootDone.current || !presentation.effectEligible) return;
    const played = playedByContent.get(story.contentHash);
    if (played?.has(beat.id)) return;
    played?.add(beat.id);
    const plan = planTextEffect(beat.text, beat.effect, {
      mode: preferences.mode,
      reduced,
    });
    if (plan.kind === "none") return;
    let disposed = false;
    let restoreText = () => {};
    import("./motion.js")
      .then((adapter) => {
        if (disposed || !root.current) return;
        const paragraph = root.current.querySelector<HTMLElement>(
          "#" + beat.id,
        );
        if (!paragraph) return;
        const color = getComputedStyle(paragraph).color,
          original = document.createElement("span"),
          clone = document.createElement("span");
        original.textContent = beat.text;
        original.style.opacity = "0";
        clone.setAttribute("aria-hidden", "true");
        clone.className = "fs-effect-clone";
        clone.style.color = color;
        for (const grapheme of plan.graphemes) {
          const span = document.createElement("span");
          span.textContent = grapheme;
          clone.append(span);
        }
        let stop = () => {};
        let finished = false;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "fs-show-immediately";
        button.textContent = "즉시 표시";
        const finish = () => {
          if (finished) return;
          finished = true;
          stop();
          paragraph.replaceChildren(document.createTextNode(beat.text));
          button.remove();
          paragraph.removeEventListener("pointerdown", finish);
          document.removeEventListener("keydown", escape);
        };
        const escape = (event: KeyboardEvent) => {
          if (event.key === "Escape") finish();
        };
        restoreText = finish;
        paragraph.replaceChildren(original, clone);
        paragraph.addEventListener("pointerdown", finish, { once: true });
        document.addEventListener("keydown", escape);
        if (plan.kind === "typewriter") {
          button.onclick = finish;
          paragraph.parentElement?.append(button);
        }
        try {
          stop = adapter.animateText(root.current, clone, plan, finish);
        } catch {
          finish();
        }
      })
      .catch(() => {});
    effectCleanup.current = () => {
      disposed = true;
      restoreText();
    };
    return () => effectCleanup.current();
  }, [
    state.beatId,
    story,
    preferences.mode,
    presentation.effectEligible,
    preferences.fontSize,
    preferences.theme,
    reduced,
  ]);
  const currentScene = story.scenes[sceneIndex]!;
  useEffect(() => {
    if (preferences.mode === "plain" || mobile) return;
    const nextScene = story.scenes[sceneIndex + 1];
    const candidates = nextScene
      ? assets[nextScene.backgroundAssetId]?.variants.filter(
          (variant) =>
            /^\/assets\/[a-z0-9][a-z0-9._-]*\.(?:avif|webp)$/.test(
              variant.path,
            ) && !variant.path.includes(".."),
        )
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
      <article className="fs-reader-main">
        <h1 className="fs-type-title">{story.title}</h1>
        {story.scenes.map((scene, index) => (
          <section
            className="fs-reader-scene"
            key={scene.id}
            aria-labelledby={scene.id}
          >
            {preferences.mode === "cinematic" ? (
              <div className="fs-reader-mobile-image fs-reader-scene-image">
                <ResponsiveAsset
                  {...(!mobile ||
                  index === sceneIndex ||
                  index === sceneIndex + 1
                    ? getAsset(scene.backgroundAssetId)
                    : fallback)}
                  decorative
                  alt=""
                  priority={index === 0}
                  aspectRatio="16 / 10"
                />
                {portrait(
                  scene.portraitAssetId,
                  !mobile || index === sceneIndex || index === sceneIndex + 1,
                )}
              </div>
            ) : null}
            <h2 id={scene.id} tabIndex={-1}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {scene.title}
            </h2>
            {scene.beats.map((beat) => (
              <div className="fs-reader-beat" key={beat.id}>
                <p
                  id={beat.id}
                  data-beat={beat.id}
                  data-effect={beat.effect}
                  className="fs-type-reading"
                >
                  {beat.text}
                </p>
                {onBookmark ? (
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
                ) : null}
              </div>
            ))}
          </section>
        ))}
        {onComplete ? (
          <div className="fs-reader-completion">
            <Button onClick={onComplete}>이 이야기를 다 읽었어요</Button>
          </div>
        ) : null}
      </article>
    </div>
  );
}
