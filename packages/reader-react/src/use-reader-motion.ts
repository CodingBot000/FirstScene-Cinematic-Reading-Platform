import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import type { Story, ReaderPrefs } from "@firstscene/story-schema";
import { storyBeats, planTextEffect } from "@firstscene/reader-core";
import { slideScene } from "./scene-slide.js";
import { playedByContent } from "./use-reading-layout.js";

type MotionOptions = {
  story: Story;
  state: { beatId: string; animateScene: boolean };
  preferences: ReaderPrefs;
  sceneId: string;
  effectEligible: boolean;
  reduced: boolean;
  root: RefObject<HTMLDivElement | null>;
  stage: RefObject<HTMLDivElement | null>;
  mobileSlide: RefObject<HTMLDivElement | null>;
  mobile: boolean;
  slideForward: boolean;
  bootDone: RefObject<boolean>;
};

export function useReaderMotion({
  story,
  state,
  preferences,
  sceneId,
  effectEligible,
  reduced,
  root,
  stage,
  mobileSlide,
  mobile,
  slideForward,
  bootDone,
}: MotionOptions) {
  const lastScene = useRef(sceneId);
  useLayoutEffect(() => {
    const sceneChanged = lastScene.current !== sceneId;
    lastScene.current = sceneId;
    if (
      !sceneChanged ||
      !slideForward ||
      reduced ||
      preferences.mode === "plain"
    )
      return;

    if (mobile) {
      const lead = mobileSlide.current;
      const picture = lead?.querySelector<HTMLElement>(".fs-asset");
      const caption = lead?.parentElement?.querySelector<HTMLElement>("h2");
      if (picture && caption) return slideScene(picture, caption);
      return;
    }

    const frame = stage.current;
    const current = frame?.querySelector<HTMLElement>(
      '[data-scene-layer="current"]',
    );
    const previous = frame?.querySelector<HTMLElement>(
      '[data-scene-layer="previous"]',
    );
    const caption = frame?.parentElement?.querySelector<HTMLElement>(
      ".fs-reader-stage-caption",
    );
    if (current && caption) return slideScene(current, caption, previous);
  }, [
    sceneId,
    slideForward,
    reduced,
    preferences.mode,
    mobile,
    mobileSlide,
    stage,
  ]);

  useEffect(() => {
    if (
      preferences.mode === "plain" ||
      reduced ||
      !stage.current ||
      !state.animateScene ||
      slideForward
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
  }, [
    sceneId,
    preferences.mode,
    reduced,
    state.animateScene,
    slideForward,
    stage,
  ]);
  useEffect(() => {
    const beat = storyBeats(story).find(
      (entry) => entry.beat.id === state.beatId,
    )?.beat;
    if (!beat || !bootDone.current || !effectEligible) return;
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
    return () => {
      disposed = true;
      restoreText();
    };
  }, [
    state.beatId,
    story,
    preferences.mode,
    effectEligible,
    preferences.fontSize,
    preferences.theme,
    reduced,
    root,
    bootDone,
  ]);
}
