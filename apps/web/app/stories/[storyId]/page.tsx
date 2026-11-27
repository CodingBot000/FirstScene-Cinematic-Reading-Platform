import { notFound } from "next/navigation";
import Link from "next/link";
import { Tag } from "@firstscene/ui/primitives";
import { ResponsiveAsset } from "@firstscene/ui/images";
import { classicById, classicSummaries } from "../../../lib/classic-catalog";
import { classicCover } from "../../../lib/classic-cover";
import { StoryDetail } from "./_components/StoryDetail";
import { stories, storyById, asset } from "../../../lib/catalog";
import { ClassicOpenAction } from "./_components/ClassicOpenAction";
import { StoryActions } from "./_components/StoryActions";

const detailCoverSizes =
  "(max-width: 359px) calc((100vw - 32px) * 0.7), (max-width: 411px) calc((100vw - 40px) * 0.7), (max-width: 860px) 260px, 320px";

export function generateStaticParams() {
  return [...stories, ...classicSummaries].map(({ id }) => ({ storyId: id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const s = storyById(storyId) ?? classicById(storyId);
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
  const { storyId } = await params;
  const classic = classicById(storyId);
  if (classic) {
    const cover = classicCover(classic.id, "detail");
    return (
      <StoryDetail
        storyId={classic.id}
        title={classic.title}
        category={"고전 · " + classic.author}
        summary={classic.summary}
        disclosure="저작권 보호기간이 만료된 원작의 전사본"
        cover={
          cover ? (
            <ResponsiveAsset
              {...cover}
              alt={classic.title + " 표지"}
              aspectRatio="3 / 4"
              sizes={detailCoverSizes}
              priority
            />
          ) : null
        }
        actions={<ClassicOpenAction storyId={classic.id} />}
      />
    );
  }
  const story = storyById(storyId);
  if (!story) notFound();
  return (
    <StoryDetail
      storyId={story.id}
      title={story.title}
      category={`${story.genre} · ${story.scenes.length}개의 장면`}
      summary={story.summary}
      disclosure="AI를 활용해 제작하고 검토한 오리지널 허구 이야기"
      cover={
        <ResponsiveAsset
          {...asset(story.coverAssetId)}
          priority
          aspectRatio="3 / 4"
          sizes={detailCoverSizes}
        />
      }
      tags={
        <div className="fs-tags">
          {story.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      }
      actions={
        <>
          <StoryActions
            storyId={story.id}
            version={story.version}
            firstBeatId={story.scenes[0]!.beats[0]!.id}
          />
          <p className="reading-note">
            장면 연출은 선택입니다. 설정에서 일반 읽기로 바꿀 수 있어요.
          </p>
        </>
      }
    >
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
    </StoryDetail>
  );
}
