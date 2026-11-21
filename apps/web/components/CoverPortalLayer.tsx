"use client";

import { useEffect, useRef } from "react";

/**
 * Portfolio graphics layer. No state, dependencies or DOM ownership leaks
 * into the real reader. SSR and unsupported GPUs retain the static cover.
 */
export function CoverPortalLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas=canvasRef.current;
    const root=canvas?.closest<HTMLElement>(".cinematic-prologue");
    if(!canvas||!root)return;
    const capable=window.matchMedia(
      "(min-width: 1024px) and (min-height: 700px) and (pointer: fine)",
    );
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
    let generation=0;
    let disposed=false;
    let release=()=>{};
    const configure=()=>{
      const current=++generation;
      release();
      release=()=>{};
      canvas.dataset.renderer="inactive";
      if(!capable.matches||reduced.matches)return;
      void import("../lib/graphics/cover-portal")
        .then(({mountCoverPortal})=>{
          if(disposed||current!==generation||!capable.matches||reduced.matches)return;
          try {
            release=mountCoverPortal(canvas,root);
          }catch {
            canvas.dataset.renderer="fallback";
          }
        })
        .catch(()=>{if(!disposed&&current===generation)canvas.dataset.renderer="fallback";});
    };
    configure();
    capable.addEventListener("change",configure);
    reduced.addEventListener("change",configure);
    return()=>{
      disposed=true;
      generation++;
      capable.removeEventListener("change",configure);
      reduced.removeEventListener("change",configure);
      release();
    };
  },[]);
  return (
    <canvas
      className="cinematic-webgl-canvas"
      ref={canvasRef}
      data-renderer="inactive"
      aria-hidden="true"
      role="presentation"
    />
  );
}
