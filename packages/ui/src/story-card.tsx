import type { ReactNode } from "react";
import { ResponsiveAsset, type AssetProps } from "./media.js";
import { Tag } from "./typography.js";
import { Progress } from "./progress.js";

export type StoryCardProps = {
  id: string;
  title: string;
  summary: string;
  cover: AssetProps;
  href: string;
  tags: readonly string[];
  progress?: number;
  action?: ReactNode;
};
export function StoryCard({
  id,
  title,
  summary,
  cover,
  href,
  tags,
  progress,
  action,
}: StoryCardProps) {
  return (
    <article className="fs-story-card" data-story={id}>
      <a href={href} className="fs-story-cover">
        <ResponsiveAsset {...cover} aspectRatio="3 / 4" />
      </a>
      <div className="fs-story-info">
        <h3 className="fs-type-title">
          <a href={href}>{title}</a>
        </h3>
        <p>{summary}</p>
        <div className="fs-tags">
          {tags.slice(0, 2).map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
        {progress !== undefined ? (
          <Progress value={progress} label="최대로 읽은 진도" />
        ) : null}
        <a className="fs-text-link" href={href}>
          이야기 만나기 <span aria-hidden="true">↗</span>
        </a>
        {action}
      </div>
    </article>
  );
}
