import { animate } from "motion/mini";

const motionQuery = "(prefers-reduced-motion: reduce)";

let disposeScene: (() => void) | undefined;
let entrancePlayed = false;
let watching = false;

function prefersReducedMotion(): boolean {
  return window.matchMedia(motionQuery).matches;
}

function playEntrance(): void {
  if (entrancePlayed || prefersReducedMotion()) return;
  const rule = document.querySelector("[data-entrance]");
  if (!(rule instanceof Element)) return;
  entrancePlayed = true;
  // motion/mini forwards keys to the Web Animations API. scaleX is not a CSS
  // property, so the horizontal scale has to be a transform keyframe.
  animate(
    rule,
    { transform: ["scaleX(0)", "scaleX(1)"] },
    { duration: 0.8, ease: "easeOut" },
  );
}

function watchScene(): void {
  if (watching || prefersReducedMotion()) return;
  const canvas = document.querySelector("canvas[data-scene]");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  watching = true;

  const view = new IntersectionObserver(
    (entries) => {
      const seen = entries.some((entry) => entry.isIntersecting);
      if (!seen || prefersReducedMotion() || disposeScene) return;
      view.disconnect();
      void import("./scene").then(({ mountScene }) => {
        if (prefersReducedMotion()) return;
        disposeScene = mountScene(canvas);
      });
    },
    { rootMargin: "120px", threshold: 0.15 },
  );

  view.observe(canvas);
}

function stopScene(): void {
  disposeScene?.();
  disposeScene = undefined;
  watching = false;
}

export function bootHome(): void {
  const sync = () => {
    if (prefersReducedMotion()) {
      stopScene();
      return;
    }
    playEntrance();
    watchScene();
  };

  sync();
  window.matchMedia(motionQuery).addEventListener("change", sync);
  window.addEventListener("pagehide", stopScene, { once: true });
}
