"use client";

import { useEffect, useRef } from "react";

/**
 * A second scroll-driven moment between the two readable stories and the
 * larger concept archive. It does not pin, so navigation remains natural.
 */
export function EditorialInterlude() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const allowed = window.matchMedia(
      "(min-width: 900px) and (prefers-reduced-motion: no-preference)",
    );
    let disposed = false;
    let generation = 0;
    let removeAnimation = () => {};

    const setup = () => {
      generation += 1;
      const ticket = generation;
      removeAnimation();
      removeAnimation = () => {};
      root.dataset.editorialMotion = "static";
      if (!allowed.matches) return;

      void Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
        .then(([gsapModule, scrollModule]) => {
          if (disposed || ticket !== generation || !allowed.matches) return;
          const { gsap } = gsapModule;
          const { ScrollTrigger } = scrollModule;
          const lines = root.querySelectorAll<HTMLElement>(".editorial-line");
          const rule = root.querySelector<HTMLElement>(".editorial-rule");
          if (lines.length !== 2 || !rule) return;
          gsap.registerPlugin(ScrollTrigger);
          let context: ReturnType<typeof gsap.context> | null = null;

          try {
            context = gsap.context(() => {
              gsap
                .timeline({
                  defaults: { ease: "none" },
                  scrollTrigger: {
                    trigger: root,
                    start: "top 88%",
                    end: "bottom 38%",
                    scrub: 0.45,
                    invalidateOnRefresh: true,
                  },
                })
                .fromTo(
                  lines[0],
                  { clipPath: "inset(0 100% 0 0)", y: 20 },
                  {
                    clipPath: "inset(0 0% 0 0)",
                    y: 0,
                    duration: 0.85,
                  },
                  0,
                )
                .fromTo(
                  lines[1],
                  { clipPath: "inset(0 100% 0 0)", y: 20 },
                  {
                    clipPath: "inset(0 0% 0 0)",
                    y: 0,
                    duration: 0.95,
                  },
                  0.35,
                )
                .fromTo(
                  rule,
                  { scaleX: 0 },
                  { scaleX: 1, duration: 1.0 },
                  0.25,
                );
            }, root);
            removeAnimation = () => {
              context?.revert();
              root.dataset.editorialMotion = "static";
            };
            root.dataset.editorialMotion = "scrub";
          } catch {
            context?.revert();
            root.dataset.editorialMotion = "static";
          }
        })
        .catch(() => {
          if (!disposed && ticket === generation)
            root.dataset.editorialMotion = "static";
        });
    };

    setup();
    allowed.addEventListener("change", setup);
    return () => {
      disposed = true;
      generation += 1;
      allowed.removeEventListener("change", setup);
      removeAnimation();
    };
  }, []);

  return (
    <section
      className="home-editorial"
      aria-label="컬렉션 소개"
      ref={rootRef}
      data-editorial-motion="static"
    >
      <p className="home-editorial-overline">A WORLD BEHIND EVERY SENTENCE</p>
      <p className="home-editorial-statement">
        <span className="editorial-line">
          어떤 이야기는 한 문장으로 시작해,
        </span>
        <span className="editorial-line">하나의 세계가 됩니다.</span>
      </p>
      <span className="editorial-rule" aria-hidden="true" />
      <a href="#coming-soon" className="home-editorial-continue">
        새로운 장면을 만나러 가기 <span aria-hidden="true">↓</span>
      </a>
    </section>
  );
}
