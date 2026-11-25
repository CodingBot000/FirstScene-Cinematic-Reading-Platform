import type { ReactNode } from "react";
import type { ReaderPrefs } from "@firstscene/story-schema";

export function ReaderFrame({
  theme,
  ready,
  children,
}: {
  theme: ReaderPrefs["theme"];
  ready: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-theme={theme}
      className="reader-page"
      data-reader-ready={ready ? "true" : "false"}
    >
      <a href="#main" className="skip-link">
        본문 바로가기
      </a>
      {children}
    </div>
  );
}
