import { classicCards } from "./classic-cards.generated";
export type ClassicSummary = (typeof classicCards)[number];
export const classicSummaries: readonly ClassicSummary[] = classicCards;
export const classicCount = classicSummaries.length;
export function classicById(id: string): ClassicSummary | undefined {
  return classicSummaries.find((item) => item.id === id);
}
