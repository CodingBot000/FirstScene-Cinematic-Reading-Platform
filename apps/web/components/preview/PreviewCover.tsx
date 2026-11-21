import type { PreviewStory } from "../../lib/preview-catalog";

type PreviewCoverProps = {
  story: PreviewStory;
  serial: string;
  imprint?: string;
};

/** A single visual contract across landing, shelves and discovery. */
export function PreviewCover({
  story,
  serial,
  imprint = "COMING SOON",
}: PreviewCoverProps) {
  return (
    <span
      className="preview-cover"
      data-palette={story.palette}
      data-illustrated={story.artworkAsset ? "true" : undefined}
    >
      {story.artworkAsset ? (
        <img
          className="preview-cover-illustration"
          src={story.artworkAsset}
          alt=""
          loading="lazy"
          decoding="async"
          aria-hidden="true"
        />
      ) : null}
      <span className="preview-cover-overline">{serial}</span>
      <span className="preview-cover-art" aria-hidden="true">
        {story.symbol}
      </span>
      <span className="preview-cover-title">{story.title}</span>
      <span className="preview-cover-imprint">{imprint}</span>
    </span>
  );
}
