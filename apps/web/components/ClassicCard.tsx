import { ResponsiveAsset } from "@firstscene/ui/images";
import { StoryCoverTransition, StoryDetailLink } from "./StoryCoverTransition";
import type { ClassicCover } from "../lib/classic-cover";
import type { ClassicSummary } from "../lib/classic-catalog";

// These widths follow the two-column mobile grids and the 1200px site shell.
const mobileSizes =
  "(max-width: 359px) calc((100vw - 44px) / 2), (max-width: 640px) calc((100vw - 52px) / 2)";
const desktopSizes = "(max-width: 1264px) calc((100vw - 118px) / 4), 287px";
const homeSizes = `${mobileSizes}, ${desktopSizes}`;
const discoverySizes = `${mobileSizes}, (max-width: 1050px) calc((100vw - 100px) / 3), ${desktopSizes}`;

export function ClassicCard({
  story,
  cover,
  index = 0,
  discovery = false,
}: {
  story: ClassicSummary;
  cover: ClassicCover | undefined;
  index?: number;
  discovery?: boolean;
}) {
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
            <ResponsiveAsset
              {...cover}
              className="classic-card-art"
              aspectRatio="3 / 4"
              alt=""
              decorative
              sizes={discovery ? discoverySizes : homeSizes}
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
