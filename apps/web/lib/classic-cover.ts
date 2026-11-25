import covers from "./classic-covers.json";

const byId: Readonly<Partial<Record<string, string>>> = covers;

export function classicCover(storyId: string) {
  return byId[storyId];
}
