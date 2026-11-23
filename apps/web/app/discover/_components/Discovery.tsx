"use client";

import { useState } from "react";
import { EmptyState } from "@firstscene/ui/primitives";
import { StoryCard } from "@firstscene/ui/cards";
import type { StoryCardProps } from "@firstscene/ui/cards";
import {
  previewCount,
  previewShelves,
  type PreviewStory,
} from "../../../lib/preview-catalog";
import { PreviewCover } from "../../../components/preview/PreviewCover";
import { PreviewNotice } from "../../../components/preview/PreviewNotice";
import { useDiscoveryQuery } from "../../../components/useDiscoveryQuery";
import { useCatalogFlip } from "../../../components/useCatalogFlip";
import {
  filterDiscovery,
  type PreviewListing,
  type Availability,
  type DiscoveryMood,
} from "../../../lib/discovery-model";

function PreviewCard({
  story,
  index,
  onSelect,
}: {
  story: PreviewListing;
  index: number;
  onSelect: (story: PreviewStory) => void;
}) {
  return (
    <article
      className="discovery-preview-card"
      data-preview-story={story.id}
      data-flip-id={`preview-${story.id}`}
    >
      <button
        type="button"
        className="preview-card"
        onClick={() => onSelect(story)}
        aria-label={`${story.title}, 공개 준비 중 안내 열기`}
      >
        <PreviewCover
          story={story}
          serial={`FIRSTSCENE / ${String(index + 1).padStart(2, "0")}`}
        />
        <span className="preview-card-meta">
          <span className="preview-card-name">{story.title}</span>
          <span className="preview-card-status">공개 예정</span>
        </span>
        <span className="discovery-preview-genre">{story.genreLabel}</span>
        <span className="preview-card-summary">{story.summary}</span>
      </button>
    </article>
  );
}

export function Discovery({
  cards,
  initialQuery,
  initialMood,
  initialStatus = "all",
  initialGenre = "all",
}: {
  cards: StoryCardProps[];
  initialQuery: string;
  initialMood: string;
  initialStatus?: Availability;
  initialGenre?: string;
}) {
  const query = useDiscoveryQuery({
    q: initialQuery,
    mood: initialMood as DiscoveryMood,
    status: initialStatus,
    genre: initialGenre,
  });
  const { q, mood, status, genre } = query.filters;
  const {
    ready: visibleReady,
    coming: visibleComing,
    count,
  } = filterDiscovery(cards, query.filters);
  const [selected, setSelected] = useState<PreviewStory | null>(null);
  const { container: catalogRef, transition: transitionCatalog } =
    useCatalogFlip(
      [
        ...visibleReady.map((story) => story.id),
        ...visibleComing.map((story) => story.id),
      ].join("|"),
    );
  const reset = () => transitionCatalog(query.reset);

  return (
    <>
      <form
        className="discovery-form discovery-form-wide"
        method="get"
        action="/discover"
      >
        <label htmlFor="story-search">작품 제목 검색</label>
        <div className="search-row">
          <input
            id="story-search"
            name="q"
            type="search"
            maxLength={80}
            value={q}
            onChange={(event) => query.search(event.target.value)}
            placeholder="제목, 장르, 장면을 검색해 보세요"
          />
          <button type="submit" className="fs-button fs-secondary">
            검색
          </button>
        </div>

        <fieldset className="mood-filters discovery-status-filters">
          <legend>공개 상태</legend>
          {(
            [
              ["all", `전체 ${cards.length + previewCount}`],
              ["ready", `지금 읽기 ${cards.length}`],
              ["coming", `공개 예정 ${previewCount}`],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="status"
                value={value}
                checked={status === value}
                onChange={() => transitionCatalog(() => query.status(value))}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="mood-filters discovery-mood-filters">
          <legend>분위기</legend>
          {(
            [
              ["all", "모든 분위기"],
              ["calm", "잔잔함"],
              ["mystery", "미스터리"],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="mood"
                value={value}
                checked={mood === value}
                onChange={() => transitionCatalog(() => query.mood(value))}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="discovery-genre-filter">
          <legend>장르 컬렉션</legend>
          <div className="discovery-genre-options">
            <label>
              <input
                type="radio"
                name="genre"
                value="all"
                checked={genre === "all"}
                onChange={() => transitionCatalog(() => query.genre("all"))}
              />
              <span>모든 장르</span>
            </label>
            {previewShelves.map((shelf) => (
              <label key={shelf.id}>
                <input
                  type="radio"
                  name="genre"
                  value={shelf.id}
                  checked={genre === shelf.id}
                  onChange={() =>
                    transitionCatalog(() => query.genre(shelf.id))
                  }
                />
                <span>{shelf.genre}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </form>

      <div className="discovery-result-heading">
        <p className="results-count" role="status">
          {count}편의 이야기
          {visibleReady.length > 0
            ? ` · 읽기 가능 ${visibleReady.length}편`
            : ""}
          {visibleComing.length > 0
            ? ` · 공개 예정 ${visibleComing.length}편`
            : ""}
        </p>
        <button
          type="button"
          className="fs-text-link discovery-reset"
          onClick={reset}
        >
          필터 초기화
        </button>
      </div>

      {count ? (
        <div
          className="discovery-catalog"
          ref={catalogRef}
          key={`${status}:${mood}:${genre}`}
        >
          {visibleReady.map((card) => (
            <div
              key={card.id}
              className="discovery-finished-card"
              data-flip-id={`ready-${card.id}`}
            >
              <StoryCard {...card} />
            </div>
          ))}
          {visibleComing.map((story, index) => (
            <PreviewCard
              key={story.id}
              story={story}
              index={index}
              onSelect={setSelected}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="조건에 맞는 이야기가 없어요."
          description="다른 제목이나 장르를 선택해 보세요."
          action={
            <button
              type="button"
              className="fs-button fs-secondary"
              onClick={reset}
            >
              전체 작품 보기
            </button>
          }
        />
      )}

      <PreviewNotice
        story={selected}
        onDismiss={() => setSelected(null)}
        href="/discover?status=ready"
        linkLabel="지금 읽을 수 있는 작품 보기"
      />
    </>
  );
}
