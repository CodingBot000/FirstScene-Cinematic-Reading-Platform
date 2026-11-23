import { SiteShell } from "../../components/SiteShell";
import { Discovery } from "./_components/Discovery";
import { stories, storyCard } from "../../lib/catalog";
import { previewShelves } from "../../lib/preview-catalog";
import { classicCount } from "../../lib/classic-catalog";

export const metadata = {
  title: "이야기 탐색",
  description: "오리지널 2편, 읽을 수 있는 고전 20편과 공개 예정 콘셉트 34편을 둘러보세요.",
};

export default async function Discover({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q =
    typeof params.q === "string" ? params.q.normalize("NFC").slice(0, 80) : "";
  const mood = ["calm", "mystery"].includes(String(params.mood))
    ? String(params.mood)
    : "all";
  const status =
    params.status === "ready" || params.status === "coming"
      ? params.status
      : "all";
  const genre =
    typeof params.genre === "string" &&
    previewShelves.some((shelf) => shelf.id === params.genre)
      ? params.genre
      : "all";
  return (
    <SiteShell>
      <div className="page-intro discovery-intro">
        <p className="preview-eyebrow">THE FIRSTSCENE COLLECTION</p>
        <h1>
          어떤 장면에
          <br />
          머무르고 싶나요?
        </h1>
        <p>
          지금 읽을 수 있는 오리지널 2편과 고전 {classicCount}편, 그리고 공개 예정 콘셉트 34편.
        </p>
      </div>
      <Discovery
        cards={stories.map(storyCard)}
        initialQuery={q}
        initialMood={mood}
        initialStatus={status}
        initialGenre={genre}
      />
    </SiteShell>
  );
}
