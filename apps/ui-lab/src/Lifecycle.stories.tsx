import { useEffect, useState } from "react";
import { gsap } from "gsap";
import { StoryReader } from "@firstscene/reader-react";
import { Button } from "@firstscene/ui";
import type { Story } from "@firstscene/story-schema";
import manuscript from "../../../content/generated/stories/post-office.json";
const story = manuscript as Story;
declare global {
  interface Window {
    firstsceneLifecycle?: {
      version: string;
      tweens: () => number;
    };
  }
}
function LifecycleHarness() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Developer-only Storybook fixture, never imported by the product application.
    window.firstsceneLifecycle = {
      version: gsap.version,
      tweens: () => gsap.globalTimeline.getChildren(true, true, true).length,
    };
    return () => {
      delete window.firstsceneLifecycle;
    };
  }, []);
  return (
    <div data-lifecycle-mounted={String(mounted)}>
      <div style={{ position: "fixed", zIndex: 100, top: 0, right: 0 }}>
        <Button onClick={() => setMounted((value) => !value)}>
          {mounted ? "검사 대상 제거" : "검사 대상 마운트"}
        </Button>
      </div>
      {mounted && (
        <StoryReader
          story={story}
          assets={{}}
          preferences={{
            mode: "cinematic",
            fontSize: 20,
            theme: "dark",
            reduceMotion: false,
          }}
        />
      )}
    </div>
  );
}
export default {
  title: "FirstScene/Verification",
  parameters: { layout: "fullscreen" },
};
export const Lifecycle = { render: () => <LifecycleHarness /> };
