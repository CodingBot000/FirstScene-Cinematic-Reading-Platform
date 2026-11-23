import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteShell } from "../../../components/SiteShell";
import { classicSummaries, classicById } from "../../../lib/classic-catalog";
import { loadClassicManuscript } from "../../../lib/classic-content";

export function generateStaticParams() {
  return classicSummaries.map(({ id }) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const story = classicById((await params).id);
  return {
    title: story ? `${story.title} — ${story.author}` : "작품을 찾을 수 없어요",
    description: story?.summary,
  };
}

export default async function ClassicReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const story = classicById(id);
  if (!story) notFound();
  const document = await loadClassicManuscript(story.id);
  if (!document) notFound();
  return (
    <SiteShell>
      <div className="classic-reading-page">
        <Link className="fs-text-link" href="/discover?status=ready">
          ← 읽을 작품 목록
        </Link>
        <header className="classic-reading-header">
          <p className="classic-reading-eyebrow">
            FIRSTSCENE · KOREAN CLASSICS
          </p>
          <h1>{story.title}</h1>
          <p className="classic-reading-author">원작 {story.author}</p>
          <p className="classic-reading-summary">{story.summary}</p>
          <p className="disclosure">
            저작권 보호기간이 만료된 원작의 전사본입니다. 고전 작품은 오리지널
            2편의 시네마틱 연출과 별도로, 본문 읽기에 집중하도록 제공합니다.
          </p>
        </header>
        <article
          aria-label={`${story.title} 본문`}
          className="classic-reading-body"
          data-classic-text={story.id}
        >
          {document.text
            .split(/\n\s*\n/)
            .filter(Boolean)
            .map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
        </article>
        <footer className="classic-reading-source">
          <h2>작품과 원문 출처</h2>
          <p>원작자: {story.author} · 저작권 보호기간 만료 원작</p>
          <p>
            원본 작품 기록:{" "}
            <a href={story.sourceUrl} rel="noopener noreferrer" target="_blank">
              한국저작권위원회 공유마당
            </a>
          </p>
          <p>
            전사 텍스트 출처:{" "}
            <a
              href={story.transcriptionUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {story.sourceRepository}
            </a>
          </p>
          <p className="disclosure">
            원작의 저작권 보호기간 만료와 전사본·편집본의 별도 이용조건은
            구분됩니다. 텍스트의 전사·정제 과정에 차이가 있을 수 있으며,
            FirstScene이 이 작품의 저작자라는 뜻이 아닙니다.
          </p>
          <Link className="fs-text-link" href="/discover?status=ready">
            다른 작품 읽기 →
          </Link>
        </footer>
      </div>
    </SiteShell>
  );
}
