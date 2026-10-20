"use client";

import * as React from "react";
import { useGsapEffect, type GsapApi } from "@/lib/gsap";
import { REDUCED_MOTION_QUERY } from "@/lib/motion";

/**
 * Scroll-scrubbed "emerge" for large product imagery: starts slightly tilted back and smaller, settles flat as it
 * reaches reading position. Desktop-width and no-reduced-motion only; otherwise the element is simply static.
 */
export function TiltIn({ className, children, ...rest }: React.ComponentProps<"div">) {
  const ref = React.useRef<HTMLDivElement>(null);

  const prepare = React.useCallback(() => window.matchMedia(REDUCED_MOTION_QUERY).matches, []);
  const setup = React.useCallback(({ gsap }: GsapApi) => {
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(
        el,
        { rotateX: 7, scale: 0.95, transformPerspective: 1600, transformOrigin: "50% 0%" },
        {
          rotateX: 0,
          scale: 1,
          ease: "none",
          scrollTrigger: { trigger: el, start: "top 95%", end: "top 30%", scrub: 0.6 },
        },
      );
    });
    return () => mm.revert();
  }, []);
  useGsapEffect(setup, prepare);

  return (
    <div ref={ref} className={className} {...rest}>
      {children}
    </div>
  );
}
