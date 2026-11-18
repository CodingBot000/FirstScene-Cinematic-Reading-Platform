import { SiteShell } from "../../components/SiteShell";
import { Button, Tag, Typography } from "@firstscene/ui";
import { tokens } from "@firstscene/tokens";
import { storyById } from "../../lib/catalog";
export default function DesignSystem() {
  const story = storyById("post-office")!;
  return (
    <SiteShell>
      <article className="prose-page">
        <h1>
          책의 여백과
          <br />
          영화의 장면.
        </h1>
        <p>
          FirstScene의 공유 디자인 시스템입니다. 편안한 읽기와 확실한 상태를
          먼저 생각합니다.
        </p>
        <h2>색과 대비</h2>
        <div className="swatches">
          {Object.entries(tokens.primitive.colors).map(([name, color]) => (
            <div key={name}>
              <span style={{ background: color }} />
              <code>
                {name}
                <br />
                {color}
              </code>
            </div>
          ))}
        </div>
        <h2>타이포그래피</h2>
        <Typography variant="title">문장을 읽고, 장면에 머물다.</Typography>
        <Typography variant="reading">
          장면이 바뀌어도 문장은 온전히 남아 있습니다.
        </Typography>
        <h2>컴포넌트</h2>
        <p className="reading-note">
          버튼과 태그의 모양·상태를 보여주는 읽기 전용 예시입니다.
        </p>
        <div className="button-examples">
          <Button>기본 버튼</Button>
          <Button variant="secondary">보조 버튼</Button>
          <Button disabled>비활성 상태</Button>
          <Button loading>로딩 상태</Button>
          <Tag>잔잔함</Tag>
        </div>
        <h2>읽기 샘플</h2>
        <section
          className="design-reading-sample"
          data-theme="dark"
          aria-label="공유 읽기 스타일 예시"
        >
          <h3>{story.scenes[0]!.title}</h3>
          {story.scenes[0]!.beats.slice(0, 2).map((beat) => (
            <Typography key={beat.id} variant="reading">
              {beat.text}
            </Typography>
          ))}
        </section>
      </article>
    </SiteShell>
  );
}
