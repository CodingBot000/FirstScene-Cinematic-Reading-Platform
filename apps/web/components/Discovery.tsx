"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StoryCard, EmptyState } from "@firstscene/ui";
import type { StoryCardProps } from "@firstscene/ui";
const normalize = (s: string) => s.normalize("NFC").toLocaleLowerCase("ko");
export function Discovery({
  cards,
  initialQuery,
  initialMood,
}: {
  cards: StoryCardProps[];
  initialQuery: string;
  initialMood: string;
}) {
  const [q, setQ] = useState(initialQuery),
    [mood, setMood] = useState(initialMood);
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
      router.replace("/discover" + (params.size ? "?" + params : ""), {
        scroll: false,
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [q, mood, router]);
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(location.search);
      setQ(params.get("q") ?? "");
      setMood(params.get("mood") ?? "all");
    };
    addEventListener("popstate", sync);
    return () => removeEventListener("popstate", sync);
  }, []);
  const filtered = cards.filter(
    (card) =>
      normalize(card.title + " " + card.tags.join(" ")).includes(
        normalize(q),
      ) &&
      (mood === "all" ||
        card.tags.includes(mood === "calm" ? "잔잔함" : "미스터리")),
  );
  return (
    <>
      <form className="discovery-form" method="get" action="/discover">
        <label htmlFor="story-search">작품 제목 검색</label>
        <div className="search-row">
          <input
            id="story-search"
            name="q"
            type="search"
            maxLength={80}
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="어떤 이야기를 찾고 있나요?"
          />
          <button type="submit" className="fs-button fs-secondary">
            검색
          </button>
        </div>
        <fieldset className="mood-filters">
          <legend>분위기</legend>
          {[
            ["all", "전체"],
            ["calm", "잔잔함"],
            ["mystery", "미스터리"],
          ].map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="mood"
                value={value}
                checked={mood === value}
                onChange={() => setMood(value!)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      </form>
      <p className="results-count" role="status">
        {filtered.length}편의 이야기
      </p>
      {filtered.length ? (
        <div className="story-grid">
          {filtered.map((card) => (
            <StoryCard key={card.id} {...card} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="조건에 맞는 이야기가 없어요."
          description="다른 제목을 검색하거나 분위기 필터를 바꿔보세요."
          action={
            <button
              className="fs-button fs-secondary"
              onClick={() => {
                setQ("");
                setMood("all");
              }}
            >
              필터 초기화
            </button>
          }
        />
      )}
    </>
  );
}
