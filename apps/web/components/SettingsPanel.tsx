"use client";
import { PreferenceControls } from "./PreferenceControls";
import { useReaderPreferences } from "../features/reader-preferences/use-reader-preferences";
import { saveStatus } from "../features/reading-sync/use-reading-sync";
import { useState, useRef } from "react";
import { Dialog, Button } from "@firstscene/ui";
export function SettingsPanel() {
  const { store, snapshot, sync, syncSnapshot } = useReaderPreferences();
  const [deleting, setDeleting] = useState(false);
  const status = useRef<HTMLParagraphElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  return (
    <>
      <fieldset
        className="settings-fieldset"
        disabled={!snapshot.ready || syncSnapshot.paused}
      >
        <legend className="fs-sr-only">읽기 환경</legend>
        <PreferenceControls
          preferences={snapshot.preferences}
          onChange={store.savePreferences}
        />
      </fieldset>
      <p className="reading-note" role="status" ref={status} tabIndex={-1}>
        {snapshot.notice ??
          syncSnapshot.notice ??
          saveStatus(syncSnapshot.status)}
      </p>
      {syncSnapshot.canRetry ? (
        <Button variant="secondary" onClick={sync.retry}>
          저장 상태 다시 확인
        </Button>
      ) : null}
      {syncSnapshot.status === "delete-error" && !deleting ? (
        <Button
          variant="secondary"
          onClick={() => void sync.resumeAfterFailedDeletion()}
        >
          기존 기록 계속 사용
        </Button>
      ) : null}
      {syncSnapshot.status === "deleted" ? (
        <a href="/discover" className="fs-text-link">
          새 이야기 만나기 →
        </a>
      ) : null}
      <h2>기록의 범위</h2>
      <p>
        회원 계정 없이 이 브라우저에서 기록을 보관하며 다른 기기에 동기화하지
        않습니다. 세션은 발급 후 30일 동안 사용할 수 있어요. 만료 기록은 정리
        작업에서 삭제하며, 서버 저장이 확인되기 전에는 임시 저장으로 표시합니다.
      </p>
      <h2>독서 기록 삭제</h2>
      <p>
        이 브라우저의 설정, 읽기 위치, 저장 문장과 피드백을 모두 지웁니다.
        삭제한 기록은 복구할 수 없습니다.
      </p>
      <Button
        ref={deleteButton}
        onClick={() => setDeleting(true)}
        disabled={
          syncSnapshot.status === "deleting" ||
          syncSnapshot.status === "deleted"
        }
      >
        독서 기록 모두 삭제
      </Button>
      <Dialog
        returnFocusTo={deleteButton}
        open={deleting}
        onOpenChange={setDeleting}
        title="독서 기록을 모두 삭제할까요?"
        description="서버 기록과 이 기기의 임시 기록을 함께 지워요. 진행 중인 저장도 멈춰요."
        onCloseAutoFocus={(event) => {
          if (syncSnapshot.status === "deleted") {
            event.preventDefault();
            status.current?.focus({ preventScroll: true });
          }
        }}
      >
        <Button
          disabled={syncSnapshot.status === "deleting"}
          onClick={async () => {
            if (
              syncSnapshot.status !== "delete-error" ||
              (await sync.resumeAfterFailedDeletion())
            )
              setDeleting(false);
          }}
        >
          {syncSnapshot.status === "delete-error"
            ? "기존 기록 계속 사용"
            : "취소"}
        </Button>
        <Button
          disabled={syncSnapshot.status === "deleting"}
          onClick={async () => {
            if (await sync.erase()) {
              setDeleting(false);
            }
          }}
        >
          모든 기록 삭제
        </Button>
        {syncSnapshot.notice && syncSnapshot.status !== "deleted" ? (
          <p role="status">{syncSnapshot.notice}</p>
        ) : null}
      </Dialog>
    </>
  );
}
