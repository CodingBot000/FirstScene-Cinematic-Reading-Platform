import { SiteShell } from "../../components/SiteShell";
import { Library as ReadingLibrary } from "../../features/library/Library";
import { stories, asset } from "../../lib/catalog";
export const metadata = { title: "내 서재" };
export default function LibraryPage() {
  const catalog = stories.map(({ id, title, scenes, coverAssetId }) => ({
    id,
    title,
    cover: asset(coverAssetId),
    scenes: scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      beats: scene.beats.map(({ id: beatId, text }) => ({ id: beatId, text })),
    })),
  }));
  return (
    <SiteShell>
      <div className="page-intro">
        <h1>내 서재</h1>
        <p>이 브라우저에서 머문 문장과 이야기.</p>
      </div>
      <ReadingLibrary catalog={catalog} />
    </SiteShell>
  );
}
