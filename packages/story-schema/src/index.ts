import { Ajv2020 } from "ajv/dist/2020.js";
import type { FromSchema } from "json-schema-to-ts";
import { storySchema } from "./schema.js";
export { storySchema } from "./schema.js";
export type Story = FromSchema<typeof storySchema>;
export type Scene = Story["scenes"][number];
export type Beat = Scene["beats"][number];
export type Mood = Scene["mood"];
export type Effect = Beat["effect"];
export type BeatId = string;
export type ReaderPrefs = {
  mode: "plain" | "cinematic";
  reduceMotion: boolean;
  fontSize: 18 | 20 | 22 | 24;
  theme: "light" | "dark";
};
export type ReadingAnchor = {
  storyId: string;
  contentVersion: number;
  contentHash: string;
  sceneId: string;
  beatId: string;
  fraction: number;
  furthestOrdinal: number;
  completed: boolean;
};
export type AssetReference = { id: string; role: string; storyId?: string };
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
const schemaCheck = ajv.compile(storySchema);
export function assertStory(
  value: unknown,
  assets?: readonly AssetReference[],
): asserts value is Story {
  if (!schemaCheck(value))
    throw new Error(
      "STORY_SCHEMA: " +
        ajv.errorsText(schemaCheck.errors, { separator: "; " }),
    );
  const story = value as Story;
  const ids = new Set<string>();
  const characterIds = new Set(story.characters.map((c) => c.id));
  if (characterIds.size !== story.characters.length)
    throw new Error("DUPLICATE_CHARACTER");
  const checkId = (id: string) => {
    if (ids.has(id)) throw new Error("DUPLICATE_ID: " + id);
    ids.add(id);
  };
  const assetMap = assets ? new Map(assets.map((a) => [a.id, a])) : null;
  function checkAsset(id: string, role: string) {
    if (assetMap) {
      const asset = assetMap.get(id);
      if (
        !asset ||
        asset.role !== role ||
        (asset.storyId && asset.storyId !== story.id)
      )
        throw new Error("ASSET_REFERENCE: " + id);
    }
  }
  checkAsset(story.coverAssetId, "cover");
  if (story.scenes.length !== 6)
    throw new Error("SCENE_COUNT: canonical v1 requires six scenes");
  let effects = 0;
  for (const scene of story.scenes) {
    checkId(scene.id);
    checkAsset(scene.backgroundAssetId, "background");
    if (scene.portraitAssetId) checkAsset(scene.portraitAssetId, "portrait");
    if (scene.beats.length !== 6) throw new Error("BEAT_COUNT: " + scene.id);
    for (const beat of scene.beats) {
      checkId(beat.id);
      if (!beat.text.trim() || /[<>]/.test(beat.text))
        throw new Error("UNSAFE_OR_EMPTY_TEXT: " + beat.id);
      if (
        beat.kind === "dialogue" &&
        (!beat.speaker || !characterIds.has(beat.speaker))
      )
        throw new Error("UNKNOWN_SPEAKER: " + beat.id);
      if (beat.speaker && !characterIds.has(beat.speaker))
        throw new Error("UNKNOWN_SPEAKER: " + beat.id);
      if (beat.effect !== "none") {
        effects++;
        if (
          Array.from(
            new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(
              beat.text,
            ),
          ).length > 120
        )
          throw new Error("EFFECT_LENGTH: " + beat.id);
      }
    }
  }
  if (effects > 4) throw new Error("EFFECT_COUNT");
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) +
            ":" +
            canonicalJson((value as Record<string, unknown>)[key]),
        )
        .join(",") +
      "}"
    );
  if (typeof value === "number" && !Number.isInteger(value))
    throw new Error("Canonical story numbers must be integers");
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error("Unsupported canonical value");
  return result;
}
