const timing = {
  duration: 500,
  easing: "cubic-bezier(0.22, 0.72, 0.25, 1)",
  fill: "both",
} as const;

export function slideScene(
  incoming: HTMLElement,
  caption: HTMLElement,
  outgoing?: HTMLElement | null,
) {
  const image = incoming.querySelector("img");
  if (!image || typeof incoming.animate !== "function") return;

  const animations = [
    incoming.animate(
      [
        { transform: outgoing ? "translateX(100%)" : "translateX(18%)" },
        { transform: "none" },
      ],
      timing,
    ),
    caption.animate(
      [{ transform: "translateY(8px)" }, { transform: "none" }],
      timing,
    ),
  ];
  if (outgoing) {
    animations.push(
      outgoing.animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 1, transform: "translateX(-8%)" },
        ],
        timing,
      ),
    );
  }

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(deadline);
    for (const animation of animations) animation.cancel();
  };
  // Let the reader keep scrolling if the new image cannot be decoded quickly.
  for (const animation of animations) {
    animation.pause();
    animation.currentTime = 0;
  }
  const deadline = window.setTimeout(stop, 220);
  void image.decode().then(() => {
    if (stopped) return;
    window.clearTimeout(deadline);
    for (const animation of animations) animation.play();
  }, stop);
  void Promise.all(animations.map((animation) => animation.finished)).then(
    stop,
    stop,
  );
  return stop;
}
