import { notFound } from "next/navigation";
import { stories, storyById, asset, storyCard } from "../../../lib/catalog";
import { ReaderController } from "../../../components/ReaderController";
export function generateStaticParams() {
  return stories.map((s) => ({ storyId: s.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  return {
    title:
      storyById((await params).storyId)?.title ?? "이야기를 찾을 수 없어요",
  };
}
export default async function Read({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const story = storyById((await params).storyId);
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
