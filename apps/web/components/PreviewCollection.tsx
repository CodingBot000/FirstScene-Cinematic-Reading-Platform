"use client";

import { useRef, useState } from "react";
import { PreviewCover } from "./preview/PreviewCover";
import { usePreviewShelfNavigation } from "./usePreviewShelfNavigation";
import { PreviewNotice } from "./preview/PreviewNotice";
import {
  previewCount,
  previewShelves,
  type PreviewStory,
} from "../lib/preview-catalog";
import { classicCount } from "../lib/classic-catalog";

/**
 * A presentation catalog only. Clicking these items never creates a reader
 * session or touches the canonical story, bookmark, or progress APIs.
 */
/**
 * A compact cover wall directly below the hero. Its ten teaser covers are
 * clickable, but explicitly remain unpublished concepts.
 */
export function PreviewTeaser() {
  const [selected, setSelected] = useState<PreviewStory | null>(null);
  const selections = previewShelves.flatMap((shelf) =>
    shelf.stories.slice(0, 2),
  );
  return (
    <section className="preview-teaser" aria-label="공개 예정 작품 미리보기">
      <div className="preview-teaser-heading">
        <span>FIRSTSCENE ARCHIVE</span>
        <p>
          읽을 수 있는 이야기 {2 + classicCount}편 + 공개 예정 작품{" "}
          {previewCount}편
        </p>
        <a href="#coming-soon" className="fs-text-link">
          전체 컬렉션 보기 <span aria-hidden="true">↗</span>
        </a>
      </div>
      <div className="preview-teaser-strip">
        {selections.map((story, index) => (
          <button
            key={story.id}
            type="button"
            className="preview-teaser-item"
            onClick={() => setSelected(story)}
            aria-label={`${story.title}, 공개 준비 중 안내 열기`}
          >
            <PreviewCover
              story={story}
              serial={`NO. ${String(index + 1).padStart(2, "0")}`}
            />
          </button>
        ))}
      </div>
      <PreviewNotice
        story={selected}
        onDismiss={() => setSelected(null)}
        href="#read-now"
        linkLabel="완결작 보기"
      />
    </section>
  );
}

export function PreviewCollection() {
  const [selected, setSelected] = useState<PreviewStory | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const activeShelf = usePreviewShelfNavigation(rootRef);

  return (
    <section
      className="preview-collection"
      id="coming-soon"
      aria-labelledby="preview-heading"
      ref={rootRef}
    >
      <div className="preview-collection-intro">
        <span className="preview-eyebrow">EXPLORE WHAT IS NEXT</span>
        <div className="preview-intro-line">
          <h2 id="preview-heading">
            아직 열리지 않은
            <br />
            {previewCount}개의 세계
          </h2>
          <p>
            첫 장면을 기다리는 이야기들. 다른 계절, 다른 도시,
            <br className="preview-desktop-break" />
            다른 마음의 문을 하나씩 넘겨 보세요.
          </p>
        </div>
        <p className="preview-availability">
          아래 작품들은 콘셉트 미리보기이며, 본문은 아직 공개되지 않았습니다.
        </p>
      </div>

      <nav
        className="preview-jump-nav"
        aria-label="공개 예정 이야기 장르 바로가기"
      >
        <span className="preview-jump-label">SCROLL TO DISCOVER</span>
        {previewShelves.map((shelf) => (
          <a
            key={shelf.id}
            href={`#preview-${shelf.id}`}
            aria-current={activeShelf === shelf.id ? "location" : undefined}
          >
            {shelf.title}
          </a>
        ))}
        <span className="preview-track" aria-hidden="true">
          <span className="preview-track-fill" />
        </span>
      </nav>

      {previewShelves.map((shelf, groupIndex) => (
        <section
          className="preview-shelf"
          id={`preview-${shelf.id}`}
          aria-labelledby={`preview-heading-${shelf.id}`}
          key={shelf.id}
        >
          <div className="preview-shelf-heading">
            <span className="preview-shelf-index">
              CHAPTER {shelf.index} /{" "}
              {previewShelves.length.toString().padStart(2, "0")}
            </span>
            <p className="preview-shelf-genre">{shelf.genre}</p>
            <h3 id={`preview-heading-${shelf.id}`}>{shelf.title}</h3>
            <p className="preview-shelf-description">{shelf.description}</p>
            <span className="preview-shelf-count">
              {shelf.stories.length} STORIES · COMING SOON
            </span>
          </div>

          <div className="preview-grid">
            {shelf.stories.map((story, index) => (
              <article
                key={story.id}
                className="preview-tile"
                style={{ transitionDelay: `${Math.min(index % 4, 3) * 65}ms` }}
              >
                <button
                  className="preview-card"
                  type="button"
                  onClick={() => setSelected(story)}
                  aria-label={`${story.title}, 공개 준비 중 안내 열기`}
                >
                  <PreviewCover
                    story={story}
                    serial={`FIRSTSCENE / ${String(groupIndex + 1).padStart(2, "0")}`}
                    imprint="AN ORIGINAL FICTION"
                  />
                  <span className="preview-card-meta">
                    <span className="preview-card-name">{story.title}</span>
                    <span className="preview-card-status">공개 예정</span>
                  </span>
                  <span className="preview-card-summary">{story.summary}</span>
                </button>
              </article>
            ))}
          </div>
        </section>
      ))}

      <div className="preview-outro">
        <p className="preview-outro-kicker">THE NEXT SCENE IS YOURS</p>
        <p>이야기는 아직 끝나지 않았습니다.</p>
        <a href="#read-now" className="fs-text-link">
          지금 읽을 수 있는 작품으로 돌아가기 <span aria-hidden="true">↗</span>
        </a>
      </div>

      <PreviewNotice
        story={selected}
        onDismiss={() => setSelected(null)}
        href="/discover?status=ready"
        linkLabel="읽을 수 있는 작품 둘러보기"
      />
    </section>
  );
}
