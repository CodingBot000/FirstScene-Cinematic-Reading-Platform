"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CoverPortalLayer } from "./CoverPortalLayer";
import { ResponsiveAsset } from "@firstscene/ui";
import type { AssetProps } from "@firstscene/ui";
import {
  cinematicScenes,
  type CinematicSceneDefinition,
} from "../lib/cinematic-scenes";

type SceneArtworkProps = {
  scene: CinematicSceneDefinition;
  index: number;
  postCover: AssetProps;
  tideCover: AssetProps;
};

function SceneArtwork({
  scene,
  index,
  postCover,
  tideCover,
}: SceneArtworkProps) {
  return (
    <figure
      className="cinematic-visual"
      data-cinematic-visual={index}
      aria-hidden="true"
    >
      {scene.illustration === "archive" ? (
        <div className="cinematic-archive-art">
          <img
            src="/illustrations/midnight-restoration.svg"
            width="480"
            height="640"
            loading="lazy"
            decoding="async"
            alt=""
          />
          <img
            src="/illustrations/paper-kingdom.svg"
            width="480"
            height="640"
            loading="lazy"
            decoding="async"
            alt=""
          />
        </div>
      ) : (
        <ResponsiveAsset
          {...(scene.illustration === "post" ? postCover : tideCover)}
          decorative
          priority={index === 0}
          aspectRatio="3 / 4"
          sizes="(max-width: 359px) 90px, (max-width: 640px) 124px, (max-width: 1023px) 35vw, 350px"
        />
      )}
      <figcaption>{scene.artworkCaption}</figcaption>
    </figure>
  );
}

function CinematicScene({
  scene,
  index,
  postCover,
  tideCover,
}: SceneArtworkProps) {
  const title = (
    <>
      <span className="cinematic-title-line">{scene.heading}</span>
      <span className="cinematic-title-line cinematic-title-accent">
        {scene.accent}
      </span>
    </>
  );

  return (
    <article
      className="cinematic-scene"
      data-cinematic-scene={index}
      data-layout={index === 1 ? "reverse" : "normal"}
      aria-labelledby={`cinematic-heading-${scene.id}`}
    >
      <div className="cinematic-beat" data-cinematic-beat={index}>
        <p className="cinematic-kicker">{scene.eyebrow}</p>
        {index === 0 ? (
          <h1 id={`cinematic-heading-${scene.id}`}>{title}</h1>
        ) : (
          <h2 id={`cinematic-heading-${scene.id}`}>{title}</h2>
        )}
        <p className="cinematic-excerpt">
          {scene.description[0]}
          <br />
          {scene.description[1]}
        </p>
        <p className="cinematic-beat-number">{scene.chapter}</p>
        <Link className="cinematic-scene-action" href={scene.href}>
          {scene.action} <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <SceneArtwork
        scene={scene}
        index={index}
        postCover={postCover}
        tideCover={tideCover}
      />
    </article>
  );
}

/**
 * Desktop: lazily loads ScrollTrigger and pins three semantic scenes.
 * Mobile, touch, reduced motion and no-JS: three normal-flow scene rows,
 * each containing its own relevant image, description, and working CTA.
 *
 * The scene data and GSAP timeline live in separate small modules.
 */
export function CinematicPrologue({
  postCover,
  tideCover,
}: {
  postCover: AssetProps;
  tideCover: AssetProps;
}) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const desktop = window.matchMedia(
      "(min-width: 1024px) and (min-height: 700px) and (pointer: fine)",
    );
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let generation = 0;
    let cleanup = () => {};

    const configure = () => {
      const current = ++generation;
      cleanup();
      cleanup = () => {};
      root.dataset.scrollMode = "static";
      root.dataset.scene = "0";
      if (!desktop.matches || reduced.matches) return;

      void import("../lib/cinematic-scroll")
        .then(({ mountCinematicScroll }) => {
          if (
            disposed ||
            current !== generation ||
            !desktop.matches ||
            reduced.matches
          )
            return;
          cleanup = mountCinematicScroll(root);
        })
        .catch(() => {
          // Animation failures never hide the readable SSR scene layout.
          if (disposed || current !== generation) return;
          root.classList.remove("cinematic-ready");
          root.dataset.scrollMode = "static";
          root.style.removeProperty("--cinematic-progress");
        });
    };

    configure();
    desktop.addEventListener("change", configure);
    reduced.addEventListener("change", configure);
    return () => {
      disposed = true;
      generation += 1;
      desktop.removeEventListener("change", configure);
      reduced.removeEventListener("change", configure);
      cleanup();
    };
  }, []);

  return (
    <section
      ref={rootRef}
      className="cinematic-prologue"
      id="top"
      aria-label="FirstScene 세 장면으로 시작하기"
      data-scroll-mode="static"
      data-scene="0"
    >
      <div className="cinematic-stage">
        <CoverPortalLayer />
        <div className="cinematic-sky" aria-hidden="true">
          <span className="cinematic-atmosphere cinematic-atmosphere--gold" />
          <span className="cinematic-atmosphere cinematic-atmosphere--tide" />
          <span className="cinematic-halo" />
          <span className="cinematic-orbit cinematic-orbit-one" />
          <span className="cinematic-orbit cinematic-orbit-two" />
          <span className="cinematic-monogram">FS</span>
        </div>

        <div className="cinematic-scenes">
          {cinematicScenes.map((scene, index) => (
            <CinematicScene
              key={scene.id}
              scene={scene}
              index={index}
              postCover={postCover}
              tideCover={tideCover}
            />
          ))}
        </div>

        <div className="cinematic-controls">
          <a className="cinematic-skip-link" href="#read-now">
            연출 건너뛰기 <span aria-hidden="true">↓</span>
          </a>
        </div>

        <div className="cinematic-rail" aria-hidden="true">
          <span className="cinematic-rail-label">SCROLL TO UNFOLD</span>
          <div className="cinematic-rail-dots">
            {cinematicScenes.map((scene) => (
              <span className="cinematic-rail-dot" key={scene.id} />
            ))}
          </div>
          <span className="cinematic-rail-track">
            <span />
          </span>
          <span className="cinematic-rail-counter">01 — 03</span>
        </div>
      </div>
    </section>
  );
}
