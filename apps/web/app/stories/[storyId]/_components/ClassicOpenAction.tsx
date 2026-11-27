"use client";

import { StoryOpenLink } from "../../../../components/StoryCoverTransition";
import { useReadingRecords } from "../../../../features/reading-sync/use-reading-records";

export function ClassicOpenAction({ storyId }: { storyId: string }) {
  const { snapshot } = useReadingRecords();
  const { mode, reduceMotion } = snapshot.preferences;
  return (
    <div className="story-actions">
      <StoryOpenLink
        className="fs-button fs-primary fs-lg"
        href={"/read/" + storyId}
        animate={mode === "cinematic" && !reduceMotion}
      >
        처음부터 읽기 <span aria-hidden="true">→</span>
      </StoryOpenLink>
    </div>
  );
}
