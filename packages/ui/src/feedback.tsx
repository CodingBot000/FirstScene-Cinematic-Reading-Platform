import type { ReactNode, Ref } from "react";
import { Button } from "./controls.js";

export function Toast({
  message,
  tone = "info",
  onDismiss,
}: {
  message: string;
  tone?: "info" | "error" | "success";
  onDismiss?: () => void;
}) {
  return (
    <div className={`fs-toast fs-toast-${tone}`} role="status">
      <p>{message}</p>
      {onDismiss ? (
        <Button variant="ghost" onClick={onDismiss}>
          알림 닫기
        </Button>
      ) : null}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="fs-empty">
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}
export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <section className="fs-error">
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          다시 시도
        </Button>
      ) : null}
    </section>
  );
}
export function ReadingToolbar({
  title,
  sceneIndex,
  sceneCount,
  saveStatus,
  onBack,
  onSettings,
  onToc,
  settingsButtonRef,
  tocButtonRef,
}: {
  title: string;
  sceneIndex: number;
  sceneCount: number;
  saveStatus: string;
  onBack: () => void;
  onSettings: () => void;
  onToc: () => void;
  settingsButtonRef?: Ref<HTMLButtonElement>;
  tocButtonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <header className="fs-reading-toolbar">
      <Button variant="ghost" onClick={onBack}>
        ← <span className="fs-back-label">작품 소개</span>
      </Button>
      <span className="fs-toolbar-title">{title}</span>
      <span className="fs-scene-count">
        {sceneIndex}/{sceneCount}
      </span>
      <Button variant="ghost" ref={tocButtonRef} onClick={onToc}>
        목차
      </Button>
      <Button variant="ghost" ref={settingsButtonRef} onClick={onSettings}>
        설정
      </Button>
      <small className="fs-save-status">{saveStatus}</small>
    </header>
  );
}
