import { SiteShell } from "../../components/SiteShell";
import { Discovery } from "../../components/Discovery";
import { stories, storyCard } from "../../lib/catalog";
export const metadata = { title: "이야기 탐색" };
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
  return (
    <SiteShell>
      <div className="page-intro">
        <h1>
          어떤 장면에
          <br />
          머무르고 싶나요?
        </h1>
        <p>고요한 위로 한 편, 낯선 도시의 미스터리 한 편.</p>
      </div>
      <Discovery
        cards={stories.map(storyCard)}
        initialQuery={q}
        initialMood={mood}
      />
    </SiteShell>
  );
}
