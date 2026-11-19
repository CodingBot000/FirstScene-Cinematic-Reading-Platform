"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@firstscene/ui";
import {
  previewCount,
  previewShelves,
  type PreviewStory,
} from "../lib/preview-catalog";

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
        <p>읽을 수 있는 이야기 2편 + 공개 예정 작품 {previewCount}편</p>
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
              <span className="preview-cover-overline">
                NO. {String(index + 1).padStart(2, "0")}
              </span>
              <span className="preview-cover-art" aria-hidden="true">
                {story.symbol}
              </span>
              <span className="preview-cover-title">{story.title}</span>
              <span className="preview-cover-imprint">COMING SOON</span>
            </span>
          </button>
        ))}
      </div>
      {selected ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          title={selected.title}
          description="이 작품은 현재 공개 준비 중입니다."
        >
          <p className="preview-dialog-summary">{selected.summary}</p>
          <p>
            현재 콘셉트만 공개되어 있습니다. 완결된 두 작품은 지금 바로 읽을 수
            있습니다.
          </p>
          <a
            href="#read-now"
            className="fs-text-link"
            onClick={() => setSelected(null)}
          >
            완결작 보기 <span aria-hidden="true">↗</span>
          </a>
        </Dialog>
      ) : null}
    </section>
  );
}

export function PreviewCollection() {
  const [selected, setSelected] = useState<PreviewStory | null>(null);
  const [activeShelf, setActiveShelf] = useState(previewShelves[0]!.id);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    if (!reduced.matches && "IntersectionObserver" in window) {
      const tiles = root.querySelectorAll<HTMLElement>(".preview-tile");
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            observer?.unobserve(entry.target);
          });
        },
        { rootMargin: "0px 0px -40px 0px", threshold: 0.05 },
      );
      tiles.forEach((tile) => observer?.observe(tile));
      root.classList.add("preview-motion-ready");
    }

    // Native scroll + a single rAF for all five chapter highlights and
    // the read-position bar; this also works with reduced motion enabled.
    const shelves = root.querySelectorAll<HTMLElement>(".preview-shelf");
    let frame = 0;
    const measure = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const rect = root.getBoundingClientRect();
        const range = Math.max(1, rect.height - window.innerHeight);
        const progress = Math.min(1, Math.max(0, -rect.top / range));
        root.style.setProperty("--preview-scroll-progress", String(progress));

        let current = previewShelves[0]!.id;
        for (const shelf of shelves) {
          if (shelf.getBoundingClientRect().top <= window.innerHeight * 0.45)
            current = shelf.id.slice("preview-".length);
        }
        setActiveShelf((previous) =>
          previous === current ? previous : current,
        );
      });
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      root.classList.remove("preview-motion-ready");
    };
  }, []);

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
                    <span className="preview-cover-overline">
                      FIRSTSCENE / {String(groupIndex + 1).padStart(2, "0")}
                    </span>
                    <span className="preview-cover-art" aria-hidden="true">
                      {story.symbol}
                    </span>
                    <span className="preview-cover-title">{story.title}</span>
                    <span className="preview-cover-imprint">
                      AN ORIGINAL FICTION
                    </span>
                  </span>
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

      {selected ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          title={selected.title}
          description="이 작품은 현재 공개 준비 중입니다."
        >
          <p className="preview-dialog-summary">{selected.summary}</p>
          <p>
            이 작품은 현재 콘셉트만 공개되어 있으며, 읽기 기능과 본문은 아직
            준비되지 않았습니다. 완결된 두 작품은 지금 바로 읽을 수 있습니다.
          </p>
          <a href="/discover" className="fs-text-link">
            읽을 수 있는 작품 둘러보기 <span aria-hidden="true">↗</span>
          </a>
        </Dialog>
      ) : null}
    </section>
  );
}
