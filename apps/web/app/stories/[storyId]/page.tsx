import { notFound } from "next/navigation";
import Link from "next/link";
import { ResponsiveAsset, Tag } from "@firstscene/ui";
import { SiteShell } from "../../../components/SiteShell";
import { stories, storyById, asset } from "../../../lib/catalog";
import { StoryActions } from "../../../components/StoryActions";
export function generateStaticParams() {
  return stories.map((s) => ({ storyId: s.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const s = storyById((await params).storyId);
  return {
    title: s?.title ?? "이야기를 찾을 수 없어요",
    description: s?.summary,
  };
}
export default async function StoryPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const story = storyById((await params).storyId);
  if (!story) notFound();
  return (
    <SiteShell>
      <Link href="/discover" className="fs-text-link">
        ← 이야기 탐색
      </Link>
      <section className="story-detail">
        <div className="detail-cover">
          <ResponsiveAsset
            {...asset(story.coverAssetId)}
            priority
            aspectRatio="3 / 4"
          />
        </div>
        <div className="detail-info">
          <p className="genre">{story.genre} · 6개의 장면</p>
          <h1>{story.title}</h1>
          <div className="fs-tags">
            {story.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
          <p className="story-summary">{story.summary}</p>
          <p className="disclosure">
            AI를 활용해 제작하고 검토한 오리지널 허구 이야기
          </p>
          <StoryActions
            storyId={story.id}
            version={story.version}
            firstBeatId={story.scenes[0]!.beats[0]!.id}
          />
          <p className="reading-note">
            장면 연출은 선택입니다. 설정에서 일반 읽기로 바꿀 수 있어요.
          </p>
        </div>
      </section>
      <details className="story-toc">
        <summary>여섯 장면의 목차 보기</summary>
        <ol>
          {story.scenes.map((scene) => (
            <li key={scene.id}>
              <Link href={"/read/" + story.id + "#" + scene.beats[0]!.id}>
                {scene.title}
              </Link>
            </li>
          ))}
        </ol>
      </details>
    </SiteShell>
  );
}
