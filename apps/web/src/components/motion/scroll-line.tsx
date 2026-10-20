"use client";

import * as React from "react";
import { useGsapEffect, type GsapApi } from "@/lib/gsap";
import { NO_PREFERENCE_MOTION_QUERY, REDUCED_MOTION_QUERY } from "@/lib/motion";

/**
 * A horizontal rule that draws itself left-to-right as it scrolls into view (scrubbed).
 * Fully drawn without JS or under reduced motion (see [data-scroll-line] in styles/motion.css).
 */
export function ScrollLine({ className, ...rest }: React.ComponentProps<"div">) {
  const ref = React.useRef<HTMLDivElement>(null);

  const prepare = React.useCallback(() => window.matchMedia(REDUCED_MOTION_QUERY).matches, []);
  const setup = React.useCallback(({ gsap }: GsapApi) => {
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add(NO_PREFERENCE_MOTION_QUERY, () => {
      document.documentElement.dataset.motionReady = "true";
      gsap.fromTo(
        el,
        { scaleX: 0 },
        {
          scaleX: 1,
          ease: "none",
          transformOrigin: "left center",
          scrollTrigger: { trigger: el, start: "top 85%", end: "top 40%", scrub: 0.5 },
        },
      );
    });
    return () => mm.revert();
  }, []);
  useGsapEffect(setup, prepare);

  return <div ref={ref} data-scroll-line="" aria-hidden="true" className={className} {...rest} />;
}
