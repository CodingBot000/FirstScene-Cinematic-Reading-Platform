import type { ReactNode } from "react";
import Link from "next/link";
import { SiteShell } from "../../../../components/SiteShell";

export function StoryDetail({
  title,
  category,
  cover,
  tags,
  summary,
  disclosure,
  actions,
  children,
}: {
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
        <div className="detail-cover">{cover}</div>
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
