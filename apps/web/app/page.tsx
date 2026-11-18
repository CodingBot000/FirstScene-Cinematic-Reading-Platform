import Link from "next/link";
import { ResponsiveAsset, StoryCard } from "@firstscene/ui";
import { SiteShell } from "../components/SiteShell";
import { stories, storyCard, asset } from "../lib/catalog";
export default function Home() {
  return (
    <SiteShell>
      <section className="home-hero">
        <div className="hero-copy">
          <h1>
            문장을 읽고,
            <br />
            장면에 머물다.
          </h1>
          <p>가입 없이 첫 장면부터 읽어보세요.</p>
          <Link className="fs-button fs-primary fs-lg" href="/read/post-office">
            첫 장면 읽기 <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="hero-art">
          <ResponsiveAsset
            {...asset("mail-cover")}
            priority
            aspectRatio="16 / 10"
            sizes="(max-width:640px) calc(100vw - 40px), 680px"
          />
        </div>
      </section>
      <section className="home-collection">
        <div className="section-heading">
          <h2>두 편의 이야기</h2>
          <Link href="/discover" className="fs-text-link">
            모든 이야기 <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="story-grid">
          {stories.map((story) => (
            <StoryCard key={story.id} {...storyCard(story)} />
          ))}
        </div>
      </section>
      <section className="reading-intro">
        <h2>연출은 선택할 수 있어요.</h2>
        <div className="intro-columns">
          <div>
            <h3>일반 읽기</h3>
            <p>움직임 없이 문장에 집중하세요.</p>
          </div>
          <div>
            <h3>연출 읽기</h3>
            <p>장면과 분위기를 따라 천천히 읽어보세요.</p>
          </div>
          <div>
            <h3>효과 줄이기</h3>
            <p>움직임을 줄이고, 고요한 장면에 머무르세요.</p>
          </div>
        </div>
        <p className="disclosure">
          AI를 활용해 제작하고 검토한 오리지널 허구 이야기입니다.
        </p>
      </section>
    </SiteShell>
  );
}
