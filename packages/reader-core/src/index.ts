import type {
  Story,
  Scene,
  Beat,
  ReadingAnchor,
  ReaderPrefs,
  Effect,
  Mood,
} from "@firstscene/story-schema";
export type { ReadingAnchor, ReaderPrefs } from "@firstscene/story-schema";
export type BeatRect = {
  id: string;
  top: number;
  bottom: number;
  ordinal: number;
};
export type Presentation = {
  sceneId: string;
  mood: Mood;
  backgroundAssetId: string | null;
  portraitAssetId: string | null;
  effectEligible: boolean;
};
export type MotionPolicy = {
  mode: "plain" | "cinematic";
  reduced: boolean;
  segmenterAvailable?: boolean;
};
export type EffectPlan = {
  kind: Effect;
  graphemes: string[];
  durationMs: number;
  translatePx: number;
};
export type AnchorResolution = {
  anchor: ReadingAnchor;
  ordinal: number;
  reason: "exact" | "scene-fallback" | "first-beat";
};
const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
export function storyBeats(
  story: Story,
): Array<{ beat: Beat; scene: Scene; ordinal: number }> {
  let ordinal = 0;
  return story.scenes.flatMap((scene) =>
    scene.beats.map((beat) => ({ beat, scene, ordinal: ordinal++ })),
  );
}
export function resolveActiveBeat(
  layout: readonly BeatRect[],
  anchorY: number,
): string | null {
  let first: BeatRect | undefined, active: BeatRect | undefined;
  for (const rect of layout) {
    if (
      !Number.isFinite(rect.top) ||
      !Number.isFinite(rect.bottom) ||
      rect.bottom < rect.top ||
      !Number.isFinite(rect.ordinal)
    )
      continue;
    if (!first || rect.ordinal < first.ordinal) first = rect;
    if (rect.top <= anchorY && (!active || rect.ordinal > active.ordinal))
      active = rect;
  }
  return active?.id ?? first?.id ?? null;
}
export function resolveScene(story: Story, beatId: string): Scene {
  const scene =
    story.scenes.find((s) => s.beats.some((b) => b.id === beatId)) ??
    story.scenes[0];
  if (!scene) throw new Error("EMPTY_STORY");
  return scene;
}
export function resolvePresentation(
  story: Story,
  beatId: string,
  prefs: ReaderPrefs,
): Presentation {
  const scene = resolveScene(story, beatId);
  const beat = scene.beats.find((b) => b.id === beatId) ?? scene.beats[0];
  return {
    sceneId: scene.id,
    mood: beat?.mood ?? scene.mood,
    backgroundAssetId: prefs.mode === "plain" ? null : scene.backgroundAssetId,
    portraitAssetId: prefs.mode === "plain" ? null : scene.portraitAssetId,
    effectEligible:
      prefs.mode === "cinematic" &&
      !prefs.reduceMotion &&
      beat?.effect !== "none",
  };
}
export function restoreAnchor(
  story: Story,
  saved: ReadingAnchor,
): AnchorResolution {
  const all = storyBeats(story);
  if (!all.length) throw new Error("EMPTY_STORY");
  let resolved =
    saved.storyId === story.id
      ? all.find((entry) => entry.beat.id === saved.beatId)
      : undefined;
  let reason: AnchorResolution["reason"] = "exact";
  if (!resolved) {
    reason = "scene-fallback";
    resolved =
      saved.storyId === story.id
        ? all.find((entry) => entry.scene.id === saved.sceneId)
        : undefined;
  }
  if (!resolved) {
    reason = "first-beat";
    resolved = all[0]!;
  }
  return {
    ordinal: resolved.ordinal,
    reason,
    anchor: {
      storyId: story.id,
      contentVersion: story.version,
      contentHash: story.contentHash,
      sceneId: resolved.scene.id,
      beatId: resolved.beat.id,
      fraction: reason === "exact" ? clamp(saved.fraction, 0, 1) : 0,
      furthestOrdinal: Math.max(
        resolved.ordinal,
        clamp(
          saved.contentHash === story.contentHash
            ? saved.furthestOrdinal
            : resolved.ordinal,
          0,
          all.length - 1,
        ),
      ),
      completed: saved.contentHash === story.contentHash && saved.completed,
    },
  };
}
export function anchorFromLayout(
  story: Story,
  layout: readonly BeatRect[],
  anchorY: number,
  previous?: ReadingAnchor,
): ReadingAnchor {
  const all = storyBeats(story),
    id = resolveActiveBeat(layout, anchorY);
  const current = all.find((entry) => entry.beat.id === id) ?? all[0];
  if (!current) throw new Error("EMPTY_STORY");
  const rect = layout.find((r) => r.id === current.beat.id);
  return {
    storyId: story.id,
    contentVersion: story.version,
    contentHash: story.contentHash,
    sceneId: current.scene.id,
    beatId: current.beat.id,
    fraction: rect
      ? clamp((anchorY - rect.top) / Math.max(1, rect.bottom - rect.top), 0, 1)
      : 0,
    furthestOrdinal: Math.max(
      current.ordinal,
      clamp(previous?.furthestOrdinal ?? 0, 0, all.length - 1),
    ),
    completed: previous?.completed ?? false,
  };
}
export function scrollTopForAnchor(
  rect: BeatRect,
  fraction: number,
  viewportHeight: number,
  documentHeight: number,
): number {
  return clamp(
    Math.ceil(
      rect.top +
        clamp(fraction, 0, 1) * (rect.bottom - rect.top) -
        viewportHeight * 0.42,
    ),
    0,
    Math.max(0, documentHeight - viewportHeight),
  );
}
export function planTextEffect(
  text: string,
  effect: Effect,
  policy: MotionPolicy,
): EffectPlan {
  if (
    policy.mode === "plain" ||
    policy.reduced ||
    policy.segmenterAvailable === false ||
    typeof Intl.Segmenter !== "function" ||
    effect === "none"
  )
    return { kind: "none", graphemes: [text], durationMs: 0, translatePx: 0 };
  const graphemes = Array.from(
    new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(text),
    (part) => part.segment,
  );
  if (graphemes.length > 120 || !graphemes.length)
    return { kind: "none", graphemes: [text], durationMs: 0, translatePx: 0 };
  return {
    kind: effect,
    graphemes,
    durationMs:
      effect === "reveal"
        ? Math.min(700, 300 + graphemes.length * 12)
        : Math.min(1000, Math.max(200, graphemes.length * 30)),
    translatePx: effect === "reveal" ? 6 : 0,
  };
}
