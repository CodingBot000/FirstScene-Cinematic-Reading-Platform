"use client";

import { useEffect, useState, type RefObject } from "react";
import { previewShelves } from "../lib/preview-catalog";

/** Owns landing-only shelf highlighting and cheap scroll-based reveal. */
export function usePreviewShelfNavigation(
  rootRef: RefObject<HTMLElement | null>,
) {
  const [activeShelf, setActiveShelf] = useState(previewShelves[0]!.id);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    if (!reduced.matches && "IntersectionObserver" in window) {
      const tiles = root.querySelectorAll<HTMLElement>(".preview-tile");
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            observer?.unobserve(entry.target);
          });
        },
        { rootMargin: "0px 0px -40px 0px", threshold: 0.05 },
      );
      tiles.forEach((tile) => observer?.observe(tile));
      root.classList.add("preview-motion-ready");
    }

    // Native scroll + a single rAF for all five chapter highlights and
    // the read-position bar; this also works with reduced motion enabled.
    const shelves = root.querySelectorAll<HTMLElement>(".preview-shelf");
    let frame = 0;
    const measure = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const rect = root.getBoundingClientRect();
        const range = Math.max(1, rect.height - window.innerHeight);
        const progress = Math.min(1, Math.max(0, -rect.top / range));
        root.style.setProperty("--preview-scroll-progress", String(progress));

        let current = previewShelves[0]!.id;
        for (const shelf of shelves) {
          if (shelf.getBoundingClientRect().top <= window.innerHeight * 0.45)
            current = shelf.id.slice("preview-".length);
        }
        setActiveShelf((previous) =>
          previous === current ? previous : current,
        );
      });
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      root.classList.remove("preview-motion-ready");
    };
  }, []);

  return activeShelf;
}
