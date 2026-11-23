import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  Story,
  ReadingAnchor,
  ReaderPrefs,
} from "@firstscene/story-schema";
import {
  anchorFromLayout,
  restoreAnchor,
  scrollTopForAnchor,
  storyBeats,
} from "@firstscene/reader-core";
import type { BeatRect } from "@firstscene/reader-core";

export const playedByContent = new Map<string, Set<string>>();

type ReadingLayoutOptions = {
  story: Story;
  initialAnchor: ReadingAnchor | null | undefined;
  layoutAnchor: ReadingAnchor | null | undefined;
  layoutRevision: number;
  onLayoutRestored: (() => void) | undefined;
  onAnchorChange: ((anchor: ReadingAnchor) => void) | undefined;
  preferences: ReaderPrefs;
  mobile: boolean;
};

export function useReadingLayout({
  story,
  initialAnchor,
  layoutAnchor,
  layoutRevision,
  onLayoutRestored,
  onAnchorChange,
  preferences,
  mobile,
}: ReadingLayoutOptions) {
  const root = useRef<HTMLDivElement>(null),
    layout = useRef<BeatRect[]>([]),
    latest = useRef<ReadingAnchor | null>(null),
    callback = useRef(onAnchorChange),
    bootDone = useRef(false),
    manualNavigation = useRef(0),
    suppressNextTransition = useRef(true),
    pendingLayoutAnchor = useRef<{
      anchor: ReadingAnchor;
      epoch: number;
    } | null>(null);
  const firstScene = story.scenes[0]!,
    firstBeat = firstScene.beats[0]!;
  const [state, setState] = useState({
    beatId: firstBeat.id,
    sceneId: firstScene.id,
    previousSceneId: firstScene.id,
    animateScene: false,
  });
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
    const observer = new ResizeObserver(remeasure);
    const dispose = () => {
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
    };
    try {
      addEventListener("scroll", schedule, { passive: true });
      addEventListener("resize", remeasure);
      addEventListener("wheel", manual, { passive: true });
      addEventListener("touchmove", manual, { passive: true });
      addEventListener("keydown", key);
      addEventListener("pagehide", flush);
      addEventListener("hashchange", onHashChange);
      document.addEventListener("visibilitychange", onVisibility);
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
          furthestOrdinal: Math.max(
            linked.ordinal,
            saved?.furthestOrdinal ?? 0,
          ),
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
    } catch (error) {
      // React only runs a cleanup after this effect successfully returns it.
      dispose();
      throw error;
    }
    return () => {
      try {
        if (bootDone.current && latest.current)
          callback.current?.(latest.current);
      } finally {
        dispose();
      }
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
  return { root, state, firstScene, bootDone };
}
