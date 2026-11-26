import type { ReactNode } from "react";
import Link from "next/link";
import { StoryCoverTransition } from "../../../../components/StoryCoverTransition";
import { SiteShell } from "../../../../components/SiteShell";

export function StoryDetail({
  storyId,
  title,
  category,
  cover,
  tags,
  summary,
  disclosure,
  actions,
  children,
}: {
  storyId: string;
  title: string;
  category: string;
  cover: ReactNode;
  tags?: ReactNode;
  summary: string;
  disclosure: string;
  actions: ReactNode;
  children?: ReactNode;
}) {
  return (
    <SiteShell>
      <Link href="/discover" className="fs-text-link">
        ← 이야기 탐색
      </Link>
      <section className="story-detail">
        <StoryCoverTransition storyId={storyId}>
          <div className="detail-cover">{cover}</div>
        </StoryCoverTransition>
        <div className="detail-info">
          <p className="genre">{category}</p>
          <h1>{title}</h1>
          {tags}
          <p className="story-summary">{summary}</p>
          <p className="disclosure">{disclosure}</p>
          {actions}
        </div>
      </section>
      {children}
    </SiteShell>
  );
}
