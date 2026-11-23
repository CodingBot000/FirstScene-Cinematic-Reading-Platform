import Link from "next/link";
import { StoryCard } from "@firstscene/ui/cards";
import { CinematicPrologue } from "../components/CinematicPrologue";
import { EditorialInterlude } from "../components/EditorialInterlude";
import { SiteShell } from "../components/SiteShell";
import {
  PreviewCollection,
  PreviewTeaser,
} from "../components/PreviewCollection";
import { stories, storyCard, asset } from "../lib/catalog";
export default function Home() {
  return (
    <SiteShell>
      <CinematicPrologue
        postCover={asset("mail-cover")}
        tideCover={asset("tide-cover")}
      />
      <PreviewTeaser />
      <section className="home-collection" id="read-now">
        <div className="section-heading">
          <h2>지금 읽을 수 있는 두 편</h2>
          <Link href="/discover" className="fs-text-link">
            완결작 모두 보기 <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="story-grid">
          {stories.map((story) => (
            <StoryCard key={story.id} {...storyCard(story)} />
          ))}
        </div>
      </section>
      <EditorialInterlude />
      <PreviewCollection />
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
