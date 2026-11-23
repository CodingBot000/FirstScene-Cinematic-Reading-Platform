import covers from "../lib/classic-covers.json";
import type { ClassicSummary } from "../lib/classic-catalog";
export function ClassicCard({
  story,
  index = 0,
}: {
  story: ClassicSummary;
  index?: number;
}) {
  const cover = covers[story.id as keyof typeof covers] as string | undefined;
  return (
    <a
      className="classic-card"
      href={`/classics/${story.id}`}
      aria-label={`${story.title}, ${story.author} 작품 읽기`}
    >
      <span
        className="classic-card-cover"
        aria-hidden="true"
        data-variant={index % 5}
      >
        {cover && (
          <img
            className="classic-card-art"
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
          />
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
    </a>
  );
}
