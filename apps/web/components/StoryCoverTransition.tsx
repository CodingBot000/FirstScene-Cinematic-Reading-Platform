import Link from "next/link";
import { ViewTransition } from "react";
import type { ComponentProps, ReactNode } from "react";
import { StoryCard } from "@firstscene/ui/cards";
import type { StoryCardProps } from "@firstscene/ui/cards";

const coverTransitionTypes = ["story-cover"];
const openingTransitionTypes = ["story-open"];
const noTransitionTypes: string[] = [];
const coverSharing = {
  "story-cover": "story-cover",
  "story-open": "story-open",
  default: "none",
};

type StoryLinkProps = Pick<
  ComponentProps<typeof Link>,
  "className" | "aria-label" | "children"
> & { href: string };

export function StoryDetailLink(props: StoryLinkProps) {
  return <Link {...props} transitionTypes={coverTransitionTypes} />;
}

export function StoryOpenLink({
  animate,
  ...props
}: StoryLinkProps & { animate: boolean }) {
  return (
    <Link
      {...props}
      transitionTypes={animate ? openingTransitionTypes : noTransitionTypes}
    />
  );
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
      share={coverSharing}
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
