"use client";

import * as React from "react";
import { useGsapEffect, type GsapApi } from "@/lib/gsap";
import { DURATION, EASE, NO_PREFERENCE_MOTION_QUERY, REDUCED_MOTION_QUERY } from "@/lib/motion";

/**
 * Scroll-triggered entrance for below-the-fold content.
 *
 * Progressive enhancement contract (see styles/motion.css):
 *  - No JS / reduced motion: content is visible immediately and GSAP is never downloaded.
 *  - Motion allowed: [data-reveal] / [data-reveal-item] start hidden (CSS, only under html.motion-ok), GSAP animates
 *    them in once. If GSAP is slow to arrive, the 4 s safety in the root layout reveals everything.
 *  - Only opacity + transform are animated.
 * Above-the-fold content (the hero) uses CSS-only entrances instead and must NOT use these components.
 */

interface RevealOptions {
  /** Seconds. */
  delay?: number;
  /** Start offset in px. */
  y?: number;
  /** ScrollTrigger start, e.g. "top 88%" = when the top crosses 88% of the viewport height. */
  start?: string;
}

function useRevealEffect(
  scope: React.RefObject<HTMLElement | null>,
  selector: string | null,
  { delay = 0, y = 24, start = "top 88%" }: RevealOptions,
  stagger: number,
) {
  const targetsOf = (): Element[] => {
    const root = scope.current;
    if (!root) return [];
    return selector ? Array.from(root.querySelectorAll(selector)) : [root];
  };

  useGsapEffect(
    ({ gsap }: GsapApi) => {
      const root = scope.current;
      const targets = targetsOf();
      if (!root || targets.length === 0) return;

      const mm = gsap.matchMedia();
      mm.add(NO_PREFERENCE_MOTION_QUERY, () => {
        document.documentElement.dataset.motionReady = "true";
        gsap.fromTo(
          targets,
          { opacity: 0, y },
          {
            opacity: 1,
            y: 0,
            delay,
            duration: DURATION.reveal,
            ease: EASE.emphasized,
            stagger,
            scrollTrigger: { trigger: root, start, once: true },
            onComplete: () => {
              for (const el of targets) el.setAttribute("data-revealed", "");
              gsap.set(targets, { clearProps: "opacity,transform" });
            },
          },
        );
      });
      mm.add(REDUCED_MOTION_QUERY, () => {
        for (const el of targets) el.setAttribute("data-revealed", "");
      });
      return () => mm.revert();
    },
    /** Reduced motion: show the end state now and never load GSAP. */
    () => {
      if (!window.matchMedia(REDUCED_MOTION_QUERY).matches) return false;
      for (const el of targetsOf()) el.setAttribute("data-revealed", "");
      return true;
    },
  );
}

export function Reveal({
  children,
  className,
  delay,
  y,
  start,
  ...rest
}: RevealOptions & React.ComponentProps<"div">) {
  const ref = React.useRef<HTMLDivElement>(null);
  useRevealEffect(ref, null, { delay, y, start }, 0);
  return (
    <div ref={ref} data-reveal="" className={className} {...rest}>
      {children}
    </div>
  );
}

/** Staggers direct descendants marked with `data-reveal-item`. */
export function RevealStagger({
  children,
  className,
  delay,
  y,
  start,
  stagger = 0.08,
  as = "div",
  ...rest
}: RevealOptions & {
  stagger?: number;
  /** Element to render, so lists stay real lists. */
  as?: "div" | "ol" | "ul";
} & React.ComponentProps<"div">) {
  const ref = React.useRef<HTMLDivElement>(null);
  useRevealEffect(ref, "[data-reveal-item]", { delay, y, start }, stagger);
  const Tag = as as React.ElementType;
  return (
    <Tag ref={ref} className={className} {...rest}>
      {children}
    </Tag>
  );
}
