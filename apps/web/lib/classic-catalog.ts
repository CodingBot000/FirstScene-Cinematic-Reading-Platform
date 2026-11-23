import index from "../../../content/classics/catalog.json";
export type ClassicSummary = (typeof index)[number];
export const classicSummaries: readonly ClassicSummary[] = index;
export const classicCount = classicSummaries.length;
export function classicById(id: string): ClassicSummary | undefined {
  return classicSummaries.find((item) => item.id === id);
}
