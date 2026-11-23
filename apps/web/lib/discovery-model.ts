import type { StoryCardProps } from "@firstscene/ui";
import { previewShelves, type PreviewStory } from "./preview-catalog";
import { classicSummaries } from "./classic-catalog";

export type Availability = "all" | "ready" | "coming";
export type DiscoveryMood = "all" | "calm" | "mystery";
export type DiscoveryFilters = {
  q: string;
  mood: DiscoveryMood;
  status: Availability;
  genre: string;
};
export type PreviewListing = PreviewStory & {
  shelfId: string;
  shelfTitle: string;
  genreLabel: string;
};

export const previewListings: readonly PreviewListing[] =
  previewShelves.flatMap((shelf) =>
    shelf.stories.map((story) => ({
      ...story,
      shelfId: shelf.id,
      shelfTitle: shelf.title,
      genreLabel: shelf.genre,
    })),
  );

const moodShelves: Record<Exclude<DiscoveryMood, "all">, readonly string[]> = {
  calm: ["heart", "fantasy"],
  mystery: ["city", "after-dark"],
};
const normalize = (value: string) =>
  value.normalize("NFC").toLocaleLowerCase("ko");

export function canonicalFilters(
  value: Partial<DiscoveryFilters>,
): DiscoveryFilters {
  const mood =
    value.mood === "calm" || value.mood === "mystery" ? value.mood : "all";
  const status =
    value.status === "ready" || value.status === "coming"
      ? value.status
      : "all";
  const genre = previewShelves.some((shelf) => shelf.id === value.genre)
    ? value.genre!
    : "all";
  return {
    q: (value.q ?? "").normalize("NFC").slice(0, 80),
    mood,
    status,
    // Genre shelves are previews only. A ready-only URL cannot keep one selected.
    genre: status === "ready" ? "all" : genre,
  };
}

export function parseDiscoverySearch(search: string): DiscoveryFilters {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  return canonicalFilters({
    q: params.get("q") ?? "",
    mood: (params.get("mood") ?? "all") as DiscoveryMood,
    status: (params.get("status") ?? "all") as Availability,
    genre: params.get("genre") ?? "all",
  });
}

export function serializeDiscoverySearch(filters: DiscoveryFilters): string {
  const values = canonicalFilters(filters);
  const params = new URLSearchParams();
  if (values.q) params.set("q", values.q);
  if (values.mood !== "all") params.set("mood", values.mood);
  if (values.status !== "all") params.set("status", values.status);
  if (values.genre !== "all") params.set("genre", values.genre);
  return params.size ? `?${params.toString()}` : "";
}

export function selectAvailability(
  filters: DiscoveryFilters,
  status: Availability,
): DiscoveryFilters {
  return canonicalFilters({
    ...filters,
    status,
    genre: status === "ready" ? "all" : filters.genre,
  });
}
export function selectGenre(
  filters: DiscoveryFilters,
  genre: string,
): DiscoveryFilters {
  return canonicalFilters({
    ...filters,
    genre,
    status:
      filters.status === "ready" && genre !== "all" ? "coming" : filters.status,
  });
}

export function filterDiscovery(
  stories: readonly StoryCardProps[],
  filters: DiscoveryFilters,
) {
  const { q, mood, genre, status } = canonicalFilters(filters);
  const phrase = normalize(q);
  const ready =
    status === "coming"
      ? []
      : stories.filter(
          (card) =>
            normalize(
              [card.title, card.summary, ...card.tags].join(" "),
            ).includes(phrase) &&
            (mood === "all" ||
              card.tags.includes(mood === "calm" ? "잔잔함" : "미스터리")) &&
            genre === "all",
        );
  const classics =
    status === "coming"
      ? []
      : classicSummaries.filter(
          (story) =>
            genre === "all" &&
            mood === "all" &&
            normalize([story.title, story.author, story.summary, "고전"].join(" ")).includes(phrase),
        );
  const coming =
    status === "ready"
      ? []
      : previewListings.filter(
          (story) =>
            normalize(
              [
                story.title,
                story.summary,
                story.genreLabel,
                story.shelfTitle,
              ].join(" "),
            ).includes(phrase) &&
            (genre === "all" || story.shelfId === genre) &&
            (mood === "all" || moodShelves[mood].includes(story.shelfId)),
        );
  return { ready, classics, coming, count: ready.length + classics.length + coming.length };
}
