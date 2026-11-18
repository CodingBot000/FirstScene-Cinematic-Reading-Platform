import previewData from "./preview-stories.json";

/**
 * Landing-only previews; these are not reader manuscripts and must not be
 * merged into the canonical scenes/beat catalog until they are published.
 */
export type PreviewPalette =
  | "midnight"
  | "copper"
  | "mist"
  | "plum"
  | "forest"
  | "coral"
  | "ocean"
  | "sand"
  | "rose"
  | "teal";

export type PreviewStory = {
  id: string;
  title: string;
  summary: string;
  palette: PreviewPalette;
  symbol: string;
};

export type PreviewShelf = {
  id: string;
  index: string;
  title: string;
  description: string;
  genre: string;
  stories: readonly PreviewStory[];
};

export const previewShelves = previewData as unknown as readonly PreviewShelf[];

export const previewCount = previewShelves.reduce(
  (total, shelf) => total + shelf.stories.length,
  0,
);
