import { StoryReader } from "@firstscene/reader-react";
import type { AssetMap } from "@firstscene/reader-react";
import type { Story, ReaderPrefs } from "@firstscene/story-schema";
import manuscript from "../../../content/generated/stories/post-office.json";
const story = manuscript as Story;
const prefs: ReaderPrefs = {
  mode: "cinematic",
  fontSize: 20,
  theme: "dark",
  reduceMotion: false,
};
const badAssets: AssetMap = Object.fromEntries(
  story.scenes.map((scene) => [
    scene.backgroundAssetId,
    {
      variants: [
        {
          path: "/assets/intentionally-missing.960.webp",
          format: "webp",
          width: 960,
          height: 600,
        },
      ],
      alt: "",
      decorative: true,
    },
  ]),
);
export default {
  title: "FirstScene/Reader",
  parameters: { layout: "fullscreen" },
};
export const MissingImages = {
  render: () => (
    <StoryReader story={story} assets={badAssets} preferences={prefs} />
  ),
};
export const Plain = {
  render: () => (
    <StoryReader
      story={story}
      assets={{}}
      preferences={{ ...prefs, mode: "plain" }}
    />
  ),
};
