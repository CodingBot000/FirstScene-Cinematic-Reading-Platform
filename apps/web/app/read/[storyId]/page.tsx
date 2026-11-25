import { notFound } from "next/navigation";
import { stories, storyById, asset, storyCard } from "../../../lib/catalog";
import { classicById, classicSummaries } from "../../../lib/classic-catalog";
import { loadClassicManuscript } from "../../../lib/classic-content";
import { ClassicDocument } from "./_components/ClassicDocument";
import { ClassicReader } from "./_components/ClassicReader";
import { ReaderController } from "./_components/ReaderController";
export function generateStaticParams() {
  return [...stories, ...classicSummaries].map(({ id }) => ({ storyId: id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const classic = classicById(storyId);
  return {
    title: classic
      ? `${classic.title} — ${classic.author}`
      : (storyById(storyId)?.title ?? "이야기를 찾을 수 없어요"),
    description: classic?.summary,
  };
}
export default async function Read({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const classic = classicById(storyId);
  if (classic) {
    const manuscript = await loadClassicManuscript(classic.id);
    if (!manuscript) notFound();
    return (
      <ClassicReader storyId={classic.id} title={classic.title}>
        <ClassicDocument story={classic} text={manuscript.text} />
      </ClassicReader>
    );
  }
  const story = storyById(storyId);
  if (!story) notFound();
  const assets = Object.fromEntries(
    story.scenes
      .flatMap((scene) => [
        scene.backgroundAssetId,
        ...(scene.portraitAssetId ? [scene.portraitAssetId] : []),
      ])
      .map((id) => [id, asset(id)]),
  );
  return (
    <ReaderController
      story={story}
      assets={assets}
      nextStory={storyCard(stories.find((s) => s.id !== story.id)!)}
    />
  );
}
