import { gsap } from "gsap";
import type { EffectPlan } from "@firstscene/reader-core";
export function transitionScene(root: HTMLElement, reduced: boolean) {
  const current = root.querySelector<HTMLElement>(
      '[data-scene-layer="current"]',
    ),
    old = root.querySelector<HTMLElement>('[data-scene-layer="previous"]');
  const context = gsap.context(() => {
    if (!current) return;
    if (reduced) {
      gsap.set(current, { opacity: 1 });
      if (old) gsap.set(old, { opacity: 0 });
      return;
    }
    gsap.fromTo(
      current,
      { opacity: 0 },
      { opacity: 1, duration: 0.48, overwrite: true },
    );
    if (old)
      gsap.fromTo(
        old,
        { opacity: 1 },
        { opacity: 0, duration: 0.48, overwrite: true },
      );
  }, root);
  return () => context.revert();
}
export function animateText(
  root: HTMLElement,
  clone: HTMLElement,
  plan: EffectPlan,
  onFinish: () => void,
) {
  const spans = Array.from(clone.children);
  const duration = plan.kind === "reveal" ? 0.25 : 0.001;
  const stagger =
    spans.length > 1
      ? Math.max(0, (plan.durationMs / 1000 - duration) / (spans.length - 1))
      : 0;
  const context = gsap.context(() => {
    if (plan.translatePx)
      gsap.fromTo(
        clone,
        { y: plan.translatePx },
        { y: 0, duration: Math.min(0.3, plan.durationMs / 1000) },
      );
    gsap.fromTo(
      spans,
      { opacity: 0 },
      {
        opacity: 1,
        duration,
        stagger,
        ease: plan.kind === "typewriter" ? "steps(1)" : "power1.out",
        onComplete: onFinish,
      },
    );
  }, root);
  return () => context.revert();
}
