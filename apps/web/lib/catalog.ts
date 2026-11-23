import postOffice from "../../../content/generated/stories/post-office.json";
import tideStation from "../../../content/generated/stories/tide-station.json";
import manifest from "../../../content/generated/assets.json";
import type { Story } from "@firstscene/story-schema";
import type { AssetProps } from "@firstscene/ui/images";
import type { StoryCardProps } from "@firstscene/ui/cards";
export const stories = [postOffice, tideStation] as Story[];
export function storyById(id: string) {
  return stories.find((story) => story.id === id);
}
export function asset(id: string): AssetProps {
  const value = (manifest.assets as Array<AssetProps & { id: string }>).find(
    (a) => a.id === id,
  );
  if (!value)
    return {
      variants: [],
      alt: "작품 이미지를 불러오지 못했어요",
      decorative: false,
    };
  return {
    variants: value.variants.map((v) => ({
      path: v.path,
      format: v.format,
      width: v.width,
      height: v.height,
      ...(v.bytes !== undefined ? { bytes: v.bytes } : {}),
      ...(v.sha256 ? { sha256: v.sha256 } : {}),
    })),
    alt: value.alt,
    decorative: value.decorative ?? false,
    ...(value.focalPoint
      ? { focalPoint: { x: value.focalPoint.x, y: value.focalPoint.y } }
      : {}),
  };
}
export function storyCard(story: Story): StoryCardProps {
  return {
    id: story.id,
    title: story.title,
    summary: story.summary,
    cover: asset(story.coverAssetId),
    href: "/stories/" + story.id,
    tags: story.tags,
  };
}
