"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

type FlipPlugin = (typeof import("gsap/Flip"))["Flip"];
type FlipState = ReturnType<FlipPlugin["getState"]>;

/**
 * The catalog owns only layout transitions, never filter business rules.
 * Flip is optional and loaded on desktop fine-pointer devices only.
 * Each scene remains fully interactive when the plugin is unavailable.
 */
export function useCatalogFlip(signature: string) {
  const container = useRef<HTMLDivElement>(null);
  const plugin = useRef<FlipPlugin | null>(null);
  const before = useRef<FlipState | null>(null);
  const active = useRef<{ kill(): void } | null>(null);

  useEffect(() => {
    const query = window.matchMedia(
      "(min-width: 900px) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
    let generation = 0;
    let disposed = false;
    const configure = () => {
      const ticket = ++generation;
      active.current?.kill();
      active.current = null;
      before.current = null;
      plugin.current = null;
      if (!query.matches) return;
      void Promise.all([import("gsap"), import("gsap/Flip")])
        .then(([gsap, flip]) => {
          if (disposed || ticket !== generation || !query.matches) return;
          gsap.gsap.registerPlugin(flip.Flip);
          plugin.current = flip.Flip;
        })
        .catch(() => { /* Native grid updates are the fallback. */ });
    };
    configure();
    query.addEventListener("change", configure);
    return () => {
      disposed = true;
      generation += 1;
      query.removeEventListener("change", configure);
      active.current?.kill();
      active.current = null;
      plugin.current = null;
      before.current = null;
    };
  }, []);

  const capture = () => {
    const flip = plugin.current;
    const root = container.current;
    if (!flip || !root) return;
    const nodes = root.querySelectorAll<HTMLElement>("[data-flip-id]");
    if (nodes.length) before.current = flip.getState(nodes);
  };
  const transition = (change: () => void) => {
    capture();
    change();
  };

  useLayoutEffect(() => {
    const flip = plugin.current;
    const state = before.current;
    const root = container.current;
    before.current = null;
    if (!flip || !state || !root) return;
    const targets = root.querySelectorAll<HTMLElement>("[data-flip-id]");
    if (!targets.length) return;
    active.current?.kill();
    active.current = flip.from(state, {
      targets,
      duration: 0.62,
      ease: "power2.inOut",
      scale: true,
      absolute: true,
      stagger: 0.025,
      onEnter: (elements) => {
        // Avoid opacity fades on readable text: keep WCAG contrast stable.
        const gsap = flip.Flip ? null : null;
        void gsap;
        for (const element of elements) {
          element.animate(
            [{ transform: "translateY(18px) scale(.96)" }, { transform: "none" }],
            { duration: 420, easing: "ease-out" },
          );
        }
      },
      onComplete: () => { active.current = null; },
    });
  }, [signature]);

  return { container, transition };
}
