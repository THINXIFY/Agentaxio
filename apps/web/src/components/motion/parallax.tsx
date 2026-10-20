"use client";

import * as React from "react";
import { useGsapEffect, type GsapApi } from "@/lib/gsap";
import { NO_PREFERENCE_MOTION_QUERY, REDUCED_MOTION_QUERY } from "@/lib/motion";

/**
 * Subtle scroll parallax: the wrapper drifts by `distance` px while its section passes through the viewport.
 * Reduced motion / no JS: the element simply stays put (and GSAP is not downloaded). Decorative content only.
 */
export function Parallax({
  distance = 60,
  className,
  children,
  ...rest
}: { distance?: number } & React.ComponentProps<"div">) {
  const ref = React.useRef<HTMLDivElement>(null);

  const prepare = React.useCallback(() => window.matchMedia(REDUCED_MOTION_QUERY).matches, []);
  const setup = React.useCallback(
    ({ gsap }: GsapApi) => {
      const el = ref.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(NO_PREFERENCE_MOTION_QUERY, () => {
        gsap.fromTo(
          el,
          { y: -distance / 2 },
          {
            y: distance / 2,
            ease: "none",
            scrollTrigger: {
              trigger: el.parentElement ?? el,
              start: "top bottom",
              end: "bottom top",
              scrub: 0.6,
            },
          },
        );
      });
      return () => mm.revert();
    },
    [distance],
  );
  useGsapEffect(setup, prepare);

  return (
    <div ref={ref} className={className} {...rest}>
      {children}
    </div>
  );
}
