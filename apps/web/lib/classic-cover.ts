import "server-only";
import type { AssetProps, AssetVariant } from "@firstscene/ui/images";
import manifest from "../../../content/generated/classic-cover-assets.json";

export type ClassicCover = Pick<AssetProps, "variants" | "focalPoint">;

// Only the sizes and URLs needed by each surface cross the client boundary.
const coverWidths = {
  card: [144, 240, 320, 480, 640],
  detail: [240, 320, 480, 640],
  reader: [96, 144, 240],
};
const byId = new Map(manifest.assets.map((cover) => [cover.id, cover]));

export function classicCover(
  storyId: string,
  surface: keyof typeof coverWidths,
): ClassicCover | undefined {
  const cover = byId.get(storyId);
  if (!cover) return undefined;
  const variants = cover.variants
    .filter(({ width }) => coverWidths[surface].includes(width))
    .map(({ path, format, width, height }) => ({
      path,
      format: format as AssetVariant["format"],
      width,
      height,
    }));
  return { variants, focalPoint: cover.focalPoint };
}
