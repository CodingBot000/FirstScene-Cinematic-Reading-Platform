"use client";

import type { PreviewStory } from "../../lib/preview-catalog";
import { classicCount } from "../../lib/classic-catalog";
import { Dialog } from "@firstscene/ui";

type PreviewNoticeProps = {
  story: PreviewStory | null;
  onDismiss: () => void;
  href: string;
  linkLabel: string;
};

/** Shared publication boundary: concepts may be inspected, never read. */
export function PreviewNotice({
  story,
  onDismiss,
  href,
  linkLabel,
}: PreviewNoticeProps) {
  return story ? (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
      title={story.title}
      description="이 작품은 현재 공개 준비 중입니다."
    >
      <p className="preview-dialog-summary">{story.summary}</p>
      <p>
        본문과 읽기 기능은 아직 공개되지 않았습니다. 오리지널 2편과
        저작권 만료 고전 {classicCount}편은 지금 읽을 수 있습니다.
      </p>
      <a className="fs-text-link" href={href} onClick={onDismiss}>
        {linkLabel} <span aria-hidden="true">↗</span>
      </a>
    </Dialog>
  ) : null;
}
