"use client";

import { useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Dialog } from "@firstscene/ui/overlays";
import { ReadingToolbar } from "@firstscene/ui/reader-controls";
import { PreferenceControls } from "../../../../features/reader-preferences/PreferenceControls";
import { useReadingRecords } from "../../../../features/reading-sync/use-reading-records";
import { ReaderFrame } from "./ReaderFrame";

export function ClassicReader({
  storyId,
  title,
  children,
}: {
  storyId: string;
  title: string;
  children: ReactNode;
}) {
  const { store, snapshot, syncSnapshot } = useReadingRecords();
  const preferences = snapshot.preferences;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);

  return (
    <ReaderFrame theme={preferences.theme} ready={snapshot.ready}>
      <ReadingToolbar
        title={title}
        backHref={"/stories/" + storyId}
        settingsButtonRef={settingsButton}
        onSettings={() => setSettingsOpen(true)}
      />
      <main id="main">
        <div
          className="fs-reader fs-reader-plain"
          style={
            {
              "--fs-reading-size": preferences.fontSize + "px",
            } as CSSProperties
          }
        >
          {children}
        </div>
      </main>
      <Dialog
        returnFocusTo={settingsButton}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title="읽기 설정"
        description="설정은 바로 반영되고 이 기기에 임시 저장돼요."
      >
        <fieldset className="fs-fieldset" disabled={syncSnapshot.paused}>
          <legend className="fs-sr-only">읽기 환경</legend>
          <PreferenceControls
            preferences={preferences}
            onChange={store.savePreferences}
            showPresentation={false}
          />
        </fieldset>
        {syncSnapshot.notice ? (
          <p className="reading-note" role="status">
            {syncSnapshot.notice}
          </p>
        ) : null}
      </Dialog>
    </ReaderFrame>
  );
}
