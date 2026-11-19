import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cinematicScenes, sceneIndexAtProgress } from "./cinematic-scenes";

/**
 * Only imported for desktop pointer/fine and allowed motion.
 * All triggers and inline transforms are owned by this context and reverted
 * when unmounted, resized, or reduced-motion preferences change.
 */
export function mountCinematicScroll(root: HTMLElement): () => void {
  const scenes = Array.from(
    root.querySelectorAll<HTMLElement>(".cinematic-scene"),
  );
  const visuals = Array.from(
    root.querySelectorAll<HTMLElement>("[data-cinematic-visual]"),
  );
  const atmospheres = Array.from(
    root.querySelectorAll<HTMLElement>(".cinematic-atmosphere"),
  );
  if (
    scenes.length !== cinematicScenes.length ||
    visuals.length !== cinematicScenes.length ||
    atmospheres.length !== 2
  )
    throw new Error("CINEMATIC_SCENE_STRUCTURE_MISMATCH");

  gsap.registerPlugin(ScrollTrigger);
  root.classList.add("cinematic-ready");

  let context: ReturnType<typeof gsap.context>;
  try {
    context = gsap.context(() => {
      gsap.set(scenes.slice(1), { autoAlpha: 0, y: 42 });
      gsap.set(atmospheres, { autoAlpha: 0 });

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
              sceneIndexAtProgress(self.progress, scenes.length),
            );
          },
        },
      });

      // The whole semantic scene moves together: text, cover, and its CTA.
      timeline
        .to(visuals[0]!, { scale: 1.10, yPercent: -4, duration: 1.0 }, 0)
        .to(atmospheres[0]!, { autoAlpha: 0.85, duration: 0.8 }, 0.35)
        .to(scenes[0]!, { autoAlpha: 0, y: -32, duration: 0.32 }, 0.74)
        .to(scenes[1]!, { autoAlpha: 1, y: 0, duration: 0.32 }, 0.92)
        .to(atmospheres[0]!, { autoAlpha: 0.12, duration: 0.72 }, 0.99)
        .to(atmospheres[1]!, { autoAlpha: 0.86, duration: 0.82 }, 1.05)
        .fromTo(
          visuals[1]!,
          { scale: 1.06, yPercent: 7 },
          { scale: 1, yPercent: -5, duration: 1.05 },
          1.08,
        )
        .to(scenes[1]!, { autoAlpha: 0, y: -32, duration: 0.32 }, 1.80)
        .to(scenes[2]!, { autoAlpha: 1, y: 0, duration: 0.38 }, 2.00)
        .to(atmospheres[1]!, { autoAlpha: 0.24, duration: 0.7 }, 2.03)
        .fromTo(
          visuals[2]!,
          { scale: 1.06, yPercent: 7 },
          { scale: 1, yPercent: 0, duration: 0.8 },
          2.15,
        )
        .to(scenes[2]!, { y: -6, duration: 0.6 }, 2.43);
    }, root);
  } catch (error) {
    root.classList.remove("cinematic-ready");
    throw error;
  }

  root.dataset.scrollMode = "pinned";

  return () => {
    context.revert();
    root.classList.remove("cinematic-ready");
    root.dataset.scrollMode = "static";
    root.dataset.scene = "0";
    root.style.removeProperty("--cinematic-progress");
  };
}
