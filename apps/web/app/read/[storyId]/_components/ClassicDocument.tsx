import { ResponsiveAsset } from "@firstscene/ui/images";
import { StoryCoverTransition } from "../../../../components/StoryCoverTransition";
import { classicCover } from "../../../../lib/classic-cover";
import type { ClassicSummary } from "../../../../lib/classic-catalog";
import { formatClassicParagraphs } from "../../../../lib/classic-paragraphs";

export function ClassicDocument({
  story,
  text,
}: {
  story: ClassicSummary;
  text: string;
}) {
  const cover = classicCover(story.id, "reader");
  return (
    <article className="fs-reader-main">
      <header className="classic-reading-heading">
        {cover ? (
          <StoryCoverTransition storyId={story.id}>
            <ResponsiveAsset
              {...cover}
              className="classic-reading-cover"
              alt=""
              decorative
              aspectRatio="3 / 4"
              sizes="72px"
            />
          </StoryCoverTransition>
        ) : null}
        <div>
          <h1 className="fs-type-title">{story.title}</h1>
          <p className="genre">원작 {story.author}</p>
        </div>
      </header>
      <section
        aria-label={story.title + " 본문"}
        className="classic-reading-body fs-reader-scene"
        data-classic-text={story.id}
      >
        {formatClassicParagraphs(text).map((paragraph, index) => (
          <p
            key={index}
            className="fs-type-reading"
            data-paragraph-kind={paragraph.kind}
          >
            {paragraph.text}
          </p>
        ))}
      </section>
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
          FirstScene이 이 작품의 저작자라는 뜻이 아닙니다. 읽기 편하도록 문단과
          대사 사이의 줄바꿈을 재구성했으며, 원문 문구와 구두점은 유지합니다.
        </p>
      </footer>
    </article>
  );
}
