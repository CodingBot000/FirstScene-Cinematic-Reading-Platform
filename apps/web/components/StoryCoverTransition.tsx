import Link from "next/link";
import { ViewTransition } from "react";
import type { ComponentProps, ReactNode } from "react";
import { StoryCard } from "@firstscene/ui/cards";
import type { StoryCardProps } from "@firstscene/ui/cards";

const transitionType = "story-cover";
const transitionTypes = [transitionType];

export function StoryDetailLink({
  href,
  ...props
}: Pick<
  ComponentProps<typeof Link>,
  "className" | "aria-label" | "children"
> & {
  href: string;
}) {
  return <Link {...props} href={href} transitionTypes={transitionTypes} />;
}

export function StoryCoverTransition({
  storyId,
  children,
}: {
  storyId: string;
  children: ReactNode;
}) {
  return (
    <ViewTransition
      name={`cover-${storyId}`}
      default="none"
      share={{ [transitionType]: transitionType, default: "none" }}
    >
      {children}
    </ViewTransition>
  );
}

export function StoryBrowseCard(props: StoryCardProps) {
  return (
    <StoryCard
      {...props}
      linkComponent={StoryDetailLink}
      renderCover={(image) => (
        <StoryCoverTransition storyId={props.id}>{image}</StoryCoverTransition>
      )}
    />
  );
}
