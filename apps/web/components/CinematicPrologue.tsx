"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ResponsiveAsset } from "@firstscene/ui";
import type { AssetProps } from "@firstscene/ui";

/**
 * The complete story reader remains separate from this presentational intro.
 *
 * Desktop + motion permitted: a bounded GSAP ScrollTrigger pin/scrub sequence.
 * Small screens, reduced-motion, failed JS and no-JS: all three beats remain
 * in the normal document flow, with no forced scrolling or invisible copy.
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

    const desktop = window.matchMedia("(min-width: 900px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let generation = 0;
    let removeAnimation = () => {};

    const setup = () => {
      generation += 1;
      const ticket = generation;
      removeAnimation();
      removeAnimation = () => {};
      root.classList.remove("cinematic-ready");
      root.dataset.scrollMode = "static";
      root.dataset.scene = "0";
      root.style.removeProperty("--cinematic-progress");

      // Do not even fetch the animation bundle when motion is disallowed.
      if (!desktop.matches || reduced.matches) return;

      void Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
        .then(([gsapModule, scrollModule]) => {
          if (
            disposed ||
            ticket !== generation ||
            !desktop.matches ||
            reduced.matches
          ) {
            return;
          }

          const { gsap } = gsapModule;
          const { ScrollTrigger } = scrollModule;
          const beats = root.querySelectorAll<HTMLElement>(
            "[data-cinematic-beat]",
          );
          const visuals = root.querySelectorAll<HTMLElement>(
            "[data-cinematic-visual]",
          );
          if (beats.length !== 3 || visuals.length !== 2) return;

          gsap.registerPlugin(ScrollTrigger);
          let context: ReturnType<typeof gsap.context> | null = null;

          try {
            root.classList.add("cinematic-ready");
            context = gsap.context(() => {
              gsap.set([beats[1], beats[2]], {
                autoAlpha: 0,
                y: 58,
              });
              gsap.set(visuals[1], {
                autoAlpha: 0,
                yPercent: 14,
                scale: 1.11,
              });

              const timeline = gsap.timeline({
                defaults: { ease: "none" },
                scrollTrigger: {
                  trigger: root,
                  pin: true,
                  start: "top top",
                  end: () => "+=" + Math.round(window.innerHeight * 2.25),
                  scrub: 0.55,
                  anticipatePin: 1,
                  invalidateOnRefresh: true,
                  onUpdate: (self) => {
                    root.style.setProperty(
                      "--cinematic-progress",
                      String(self.progress),
                    );
                    root.dataset.scene = String(
                      self.progress < 0.34 ? 0 : self.progress < 0.68 ? 1 : 2,
                    );
                  },
                },
              });

              // Beat 01: the opening line and the first finished story.
              timeline
                .to(visuals[0], {
                  scale: 1.18,
                  xPercent: 9,
                  yPercent: -11,
                  duration: 1.03,
                }, 0)
                .to(beats[0], {
                  autoAlpha: 0,
                  y: -45,
                  duration: 0.30,
                }, 0.70)
                // Beat 02: a second world enters as the first recedes.
                .to(visuals[0], {
                  autoAlpha: 0,
                  duration: 0.38,
                }, 0.88)
                .to(visuals[1], {
                  autoAlpha: 1,
                  scale: 1,
                  yPercent: 0,
                  duration: 0.47,
                }, 0.87)
                .to(beats[1], {
                  autoAlpha: 1,
                  y: 0,
                  duration: 0.32,
                }, 1.00)
                .to(visuals[1], {
                  scale: 1.12,
                  xPercent: -6,
                  yPercent: -8,
                  duration: 1.00,
                }, 1.42)
                .to(beats[1], {
                  autoAlpha: 0,
                  y: -45,
                  duration: 0.30,
                }, 1.81)
                // Beat 03: hand off to the actual catalog, never a fake reader.
                .to(visuals[1], {
                  autoAlpha: 0.3,
                  duration: 0.40,
                }, 2.05)
                .to(beats[2], {
                  autoAlpha: 1,
                  y: 0,
                  duration: 0.35,
                }, 2.09)
                .to(beats[2], {
                  y: -6,
                  duration: 0.65,
                }, 2.44);
            }, root);

            removeAnimation = () => {
              context?.revert();
              root.classList.remove("cinematic-ready");
              root.dataset.scrollMode = "static";
              root.dataset.scene = "0";
              root.style.removeProperty("--cinematic-progress");
            };
            root.dataset.scrollMode = "pinned";
          } catch {
            context?.revert();
            root.classList.remove("cinematic-ready");
            root.dataset.scrollMode = "static";
          }
        })
        .catch(() => {
          // A missing animation chunk must never prevent reading/navigation.
          if (!disposed && ticket === generation) {
            root.classList.remove("cinematic-ready");
            root.dataset.scrollMode = "static";
          }
        });
    };

    setup();
    desktop.addEventListener("change", setup);
    reduced.addEventListener("change", setup);
    return () => {
      disposed = true;
      generation += 1;
      desktop.removeEventListener("change", setup);
      reduced.removeEventListener("change", setup);
      removeAnimation();
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
        <div className="cinematic-sky" aria-hidden="true">
          <span className="cinematic-halo" />
          <span className="cinematic-orbit cinematic-orbit-one" />
          <span className="cinematic-orbit cinematic-orbit-two" />
          <span className="cinematic-monogram">FS</span>
        </div>

        <div className="cinematic-art" aria-hidden="true">
          <div className="cinematic-visual" data-cinematic-visual="0">
            <ResponsiveAsset
              {...postCover}
              decorative
              priority
              aspectRatio="3 / 4"
              sizes="(min-width:900px) 38vw, 45vw"
            />
            <span>THE LAST POST OFFICE · NO. 01</span>
          </div>
          <div className="cinematic-visual" data-cinematic-visual="1">
            <ResponsiveAsset
              {...tideCover}
              decorative
              aspectRatio="3 / 4"
              sizes="(min-width:900px) 38vw, 45vw"
            />
            <span>THE TIDELESS STATION · NO. 02</span>
          </div>
        </div>

        <div className="cinematic-script">
          <article className="cinematic-beat" data-cinematic-beat="0">
            <p className="cinematic-kicker">FIRSTSCENE — AN INTERACTIVE READING SPACE</p>
            <h1>
              문장을 읽고,
              <br />
              <em>장면에 머물다.</em>
            </h1>
            <p className="cinematic-excerpt">
              한 통의 편지에서 시작된 밤.
              <br />
              이야기는 눈앞의 풍경이 됩니다.
            </p>
            <span className="cinematic-beat-number">01 / 첫 번째 장면</span>
          </article>

          <article className="cinematic-beat" data-cinematic-beat="1">
            <p className="cinematic-kicker">TURN THE PAGE · ENTER ANOTHER WORLD</p>
            <h2>
              멈춰 선 역에도
              <br />
              <em>도착하는 이야기가 있다.</em>
            </h2>
            <p className="cinematic-excerpt">
              수심 없는 역, 소리가 남겨진 도시.
              <br />
              스크롤을 따라 다음 세계로 건너갑니다.
            </p>
            <span className="cinematic-beat-number">02 / 두 번째 장면</span>
          </article>

          <article className="cinematic-beat" data-cinematic-beat="2">
            <p className="cinematic-kicker">FIRSTSCENE COLLECTION / 36 STORIES</p>
            <h2>
              아직 열리지 않은
              <br />
              <em>서른네 개의 세계.</em>
            </h2>
            <p className="cinematic-excerpt">
              완성된 두 편은 지금 읽을 수 있습니다.
              <br />
              그다음 장면들은 공개를 준비하고 있어요.
            </p>
            <span className="cinematic-beat-number">03 / 이어질 장면들</span>
          </article>
        </div>

        <div className="cinematic-controls">
          <Link className="cinematic-read-link" href="/read/post-office">
            첫 장면 바로 읽기 <span aria-hidden="true">↗</span>
          </Link>
          <a className="cinematic-skip-link" href="#read-now">
            연출 건너뛰기 <span aria-hidden="true">↓</span>
          </a>
        </div>

        <div className="cinematic-rail" aria-hidden="true">
          <span className="cinematic-rail-label">SCROLL TO UNFOLD</span>
          <div className="cinematic-rail-dots">
            <span className="cinematic-rail-dot" />
            <span className="cinematic-rail-dot" />
            <span className="cinematic-rail-dot" />
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
