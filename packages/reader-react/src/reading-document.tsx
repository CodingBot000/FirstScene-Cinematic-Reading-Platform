import type { ReactNode } from "react";
import type { Story } from "@firstscene/story-schema";

type Scene = Story["scenes"][number];
type Beat = Scene["beats"][number];

type ReadingDocumentProps = {
  story: Story;
  enhanced?: boolean;
  renderSceneLead?: (scene: Scene, index: number) => ReactNode;
  renderBeatAction?: ((beat: Beat) => ReactNode) | undefined;
  children?: ReactNode;
};

export function ReadingDocument({
  story,
  enhanced = false,
  renderSceneLead,
  renderBeatAction,
  children,
}: ReadingDocumentProps) {
  return (
    <article className={enhanced ? "fs-reader-main" : "ssr-reading"}>
      <h1 className={enhanced ? "fs-type-title" : undefined}>{story.title}</h1>
      {story.scenes.map((scene, index) => (
        <section
          className={enhanced ? "fs-reader-scene" : undefined}
          key={scene.id}
          aria-labelledby={scene.id}
        >
          {renderSceneLead?.(scene, index)}
          <h2 id={scene.id} tabIndex={-1}>
            {enhanced ? (
              <span>{String(index + 1).padStart(2, "0")}</span>
            ) : null}
            {scene.title}
          </h2>
          {scene.beats.map((beat) => {
            const text = (
              <p
                key={beat.id}
                id={beat.id}
                data-beat={beat.id}
                data-effect={enhanced ? beat.effect : undefined}
                className="fs-type-reading"
              >
                {beat.text}
              </p>
            );
            return enhanced ? (
              <div className="fs-reader-beat" key={beat.id}>
                {text}
                {renderBeatAction?.(beat)}
              </div>
            ) : (
              text
            );
          })}
        </section>
      ))}
      {children}
    </article>
  );
}
