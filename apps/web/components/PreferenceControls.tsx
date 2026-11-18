"use client";
import { ToggleGroup } from "@firstscene/ui";
import type { ReaderPrefs } from "@firstscene/story-schema";
export function PreferenceControls({
  preferences: prefs,
  onChange,
}: {
  preferences: ReaderPrefs;
  onChange: (p: ReaderPrefs) => void;
}) {
  return (
    <>
      <ToggleGroup
        label="읽기 모드"
        value={prefs.mode}
        onValueChange={(mode) =>
          onChange({ ...prefs, mode: mode as ReaderPrefs["mode"] })
        }
        options={[
          { value: "plain", label: "일반 읽기" },
          { value: "cinematic", label: "연출 읽기" },
        ]}
      />
      <ToggleGroup
        label="효과"
        value={prefs.reduceMotion ? "reduced" : "full"}
        onValueChange={(value) =>
          onChange({ ...prefs, reduceMotion: value === "reduced" })
        }
        options={[
          { value: "full", label: "기본 효과" },
          { value: "reduced", label: "효과 줄이기" },
        ]}
      />
      <ToggleGroup
        label="글자 크기"
        value={String(prefs.fontSize)}
        onValueChange={(size) =>
          onChange({
            ...prefs,
            fontSize: Number(size) as ReaderPrefs["fontSize"],
          })
        }
        options={[18, 20, 22, 24].map((size) => ({
          value: String(size),
          label: size + "px",
        }))}
      />
      <ToggleGroup
        label="읽기 면"
        value={prefs.theme}
        onValueChange={(theme) =>
          onChange({ ...prefs, theme: theme as ReaderPrefs["theme"] })
        }
        options={[
          { value: "dark", label: "어둡게" },
          { value: "light", label: "밝게" },
        ]}
      />
      <p className="reading-note">
        기기의 움직임 줄이기 설정을 우선해요. 이 브라우저의 임시 설정이며 다른
        기기에 자동 동기화되지 않아요.
      </p>
    </>
  );
}
