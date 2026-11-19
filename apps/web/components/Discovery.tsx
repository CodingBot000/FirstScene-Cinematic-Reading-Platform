"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, EmptyState, StoryCard } from "@firstscene/ui";
import type { StoryCardProps } from "@firstscene/ui";
import {
  previewCount,
  previewShelves,
  type PreviewStory,
} from "../lib/preview-catalog";

type Availability = "all" | "ready" | "coming";

const normalize = (text: string) =>
  text.normalize("NFC").toLocaleLowerCase("ko");

const previewCards = previewShelves.flatMap((shelf) =>
  shelf.stories.map((story) => ({
    ...story,
    shelfId: shelf.id,
    shelfTitle: shelf.title,
    genreLabel: shelf.genre,
  })),
);

function PreviewCard({
  story,
  index,
  onSelect,
}: {
  story: (typeof previewCards)[number];
  index: number;
  onSelect: (story: PreviewStory) => void;
}) {
  return (
    <article className="discovery-preview-card" data-preview-story={story.id}>
      <button
        type="button"
        className="preview-card"
        onClick={() => onSelect(story)}
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
            FIRSTSCENE / {String(index + 1).padStart(2, "0")}
          </span>
          <span className="preview-cover-art" aria-hidden="true">
            {story.symbol}
          </span>
          <span className="preview-cover-title">{story.title}</span>
          <span className="preview-cover-imprint">COMING SOON</span>
        </span>
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
  const [q, setQ] = useState(initialQuery);
  const [mood, setMood] = useState(initialMood);
  const [status, setStatus] = useState<Availability>(initialStatus);
  const [genre, setGenre] = useState<string>(initialGenre);
  const [selected, setSelected] = useState<PreviewStory | null>(null);

  const router = useRouter();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (mood !== "all") params.set("mood", mood);
      if (status !== "all") params.set("status", status);
      if (genre !== "all") params.set("genre", genre);
      router.replace("/discover" + (params.size ? "?" + params : ""), {
        scroll: false,
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [q, mood, status, genre, router]);

  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(location.search);
      setQ((params.get("q") ?? "").slice(0, 80));
      const nextMood = params.get("mood") ?? "all";
      setMood(["calm", "mystery"].includes(nextMood) ? nextMood : "all");
      const nextStatus = params.get("status") ?? "all";
      setStatus(
        nextStatus === "ready" || nextStatus === "coming" ? nextStatus : "all",
      );
      const nextGenre = params.get("genre") ?? "all";
      setGenre(
        previewShelves.some((shelf) => shelf.id === nextGenre)
          ? nextGenre
          : "all",
      );
    };
    addEventListener("popstate", sync);
    return () => removeEventListener("popstate", sync);
  }, []);

  const ready = cards.filter(
    (card) =>
      normalize(
        card.title + " " + card.summary + " " + card.tags.join(" "),
      ).includes(normalize(q)) &&
      (mood === "all" ||
        card.tags.includes(mood === "calm" ? "잔잔함" : "미스터리")) &&
      genre === "all",
  );
  const coming = previewCards.filter(
    (story) =>
      normalize(
        story.title +
          " " +
          story.summary +
          " " +
          story.genreLabel +
          " " +
          story.shelfTitle,
      ).includes(normalize(q)) &&
      (genre === "all" || story.shelfId === genre) &&
      (mood === "all" ||
        (mood === "calm"
          ? ["heart", "fantasy"].includes(story.shelfId)
          : ["city", "after-dark"].includes(story.shelfId))),
  );

  const visibleReady = status === "coming" ? [] : ready;
  const visibleComing = status === "ready" ? [] : coming;
  const count = visibleReady.length + visibleComing.length;

  const reset = () => {
    setQ("");
    setMood("all");
    setStatus("all");
    setGenre("all");
  };

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
            onChange={(event) => setQ(event.target.value)}
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
                onChange={() => setStatus(value)}
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
                onChange={() => setMood(value)}
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
                onChange={() => setGenre("all")}
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
                  onChange={() => setGenre(shelf.id)}
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
        <div className="discovery-catalog" key={`${status}:${mood}:${genre}`}>
          {visibleReady.map((card) => (
            <div key={card.id} className="discovery-finished-card">
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
            본문과 읽기 기능은 아직 공개되지 않았습니다. 현재 완결된 두 작품은
            지금 읽을 수 있습니다.
          </p>
          <a className="fs-text-link" href="/discover?status=ready">
            지금 읽을 수 있는 작품 보기 ↗
          </a>
        </Dialog>
      ) : null}
    </>
  );
}
