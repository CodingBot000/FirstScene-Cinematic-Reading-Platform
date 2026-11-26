import { StoryCoverTransition, StoryDetailLink } from "./StoryCoverTransition";
import { classicCover } from "../lib/classic-cover";
import type { ClassicSummary } from "../lib/classic-catalog";
export function ClassicCard({
  story,
  index = 0,
}: {
  story: ClassicSummary;
  index?: number;
}) {
  const cover = classicCover(story.id);
  return (
    <StoryDetailLink
      className="classic-card"
      href={`/stories/${story.id}`}
      aria-label={`${story.title}, ${story.author} 작품 소개`}
    >
      <span
        className="classic-card-cover"
        aria-hidden="true"
        data-variant={index % 5}
      >
        {cover && (
          <StoryCoverTransition storyId={story.id}>
            <img
              className="classic-card-art"
              src={cover}
              alt=""
              loading="lazy"
              decoding="async"
            />
          </StoryCoverTransition>
        )}
        <span className="classic-card-cover-top">FIRSTSCENE CLASSICS</span>
        <span className="classic-card-cover-title">{story.title}</span>
        <span className="classic-card-cover-author">{story.author}</span>
        <span className="classic-card-cover-foot">
          PUBLIC DOMAIN · ORIGINAL WORK
        </span>
      </span>
      <span className="classic-card-details">
        <span className="classic-card-status">읽기 가능 · 고전</span>
        <strong>{story.title}</strong>
        <span className="classic-card-summary">{story.summary}</span>
      </span>
    </StoryDetailLink>
  );
}
