import { useState } from "react";
import { createRoot } from "react-dom/client";
import { tokens } from "@firstscene/tokens";
import tokenJson from "@firstscene/tokens/json";
import "@firstscene/tokens/css";
import "@firstscene/ui/css";
import { Typography } from "@firstscene/ui";
import { Button } from "@firstscene/ui/button";
import { Button as PrimitiveButton } from "@firstscene/ui/primitives";
import { isAssetVariant } from "@firstscene/ui/images";
import { assertStory } from "@firstscene/story-schema";
import type { ReaderPrefs } from "@firstscene/story-schema";
import { storyBeats } from "@firstscene/reader-core";
import { StoryReader } from "@firstscene/reader-react";
import type { AssetMap } from "@firstscene/reader-react";
import rawStory from "./story.json";
import rawAssets from "./assets.json";
import "./style.css";
const parsedStory: unknown = rawStory;
assertStory(parsedStory);
const story = parsedStory;
const assets = rawAssets as AssetMap;
const count = storyBeats(story).length;
if (
  PrimitiveButton !== Button ||
  !Object.values(assets).some((asset) => asset.variants.some(isAssetVariant))
)
  throw new Error("UI_EXPORT_MISMATCH");
if (tokens.schemaVersion !== tokenJson.schemaVersion)
  throw new Error("TOKEN_EXPORT_MISMATCH");
function Demo() {
  const [preferences, setPreferences] = useState<ReaderPrefs>({
    mode: "plain",
    reduceMotion: false,
    fontSize: 20,
    theme: "dark",
  });
  const [clicks, setClicks] = useState(0),
    [saved, setSaved] = useState<string[]>([]);
  return (
    <div data-theme="dark" data-schema-valid="true" data-core-beats={count}>
      <header className="consumer-intro">
        <Typography as="p" variant="title">
          FirstScene React 패키지 예제
        </Typography>
        <p>
          여섯 장면, 서른여섯 문장. 아래 선택은 이 화면의 메모리에서만 유지돼요.
        </p>
        <div className="consumer-controls">
          <Button onClick={() => setClicks((value) => value + 1)}>
            컴포넌트 클릭 {clicks}회
          </Button>
          <label>
            <input
              type="checkbox"
              checked={preferences.mode === "cinematic"}
              onChange={(event) =>
                setPreferences((p) => ({
                  ...p,
                  mode: event.target.checked ? "cinematic" : "plain",
                }))
              }
            />{" "}
            장면 연출 사용
          </label>
          <label>
            <input
              type="checkbox"
              checked={preferences.reduceMotion}
              onChange={(event) =>
                setPreferences((p) => ({
                  ...p,
                  reduceMotion: event.target.checked,
                }))
              }
            />{" "}
            효과 줄이기
          </label>
        </div>
      </header>
      <StoryReader
        story={story}
        assets={assets}
        preferences={preferences}
        bookmarkedBeatIds={saved}
        onBookmark={(id) =>
          setSaved((previous) =>
            previous.includes(id)
              ? previous.filter((value) => value !== id)
              : [...previous, id],
          )
        }
      />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Demo />);
