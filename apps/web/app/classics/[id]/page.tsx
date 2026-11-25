import { notFound, permanentRedirect } from "next/navigation";
import { classicById } from "../../../lib/classic-catalog";

export default async function ClassicReadRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const story = classicById((await params).id);
  if (!story) notFound();
  permanentRedirect("/read/" + story.id);
}
