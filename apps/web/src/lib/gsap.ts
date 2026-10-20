"use client";

import * as React from "react";
import type { gsap as GsapCore } from "gsap";
import type { ScrollTrigger as ScrollTriggerPlugin } from "gsap/ScrollTrigger";

/**
 * Lazy GSAP. The library (~100 KB min) is imported dynamically AFTER hydration, in idle time, and never for
 * visitors who prefer reduced motion. Nothing above the fold depends on it: the hero entrance is pure CSS
 * (styles/motion.css), and below-the-fold reveals simply start after the module arrives.
 *
 * Rules for marketing motion:
 *  - Use `useGsapEffect` (this file); never import "gsap" directly, so registration happens exactly once.
 *  - Wrap every animation in `gsap.matchMedia()` using NO_PREFERENCE_MOTION_QUERY. Reduced-motion users get the
 *    final, fully visible state, never a different or hidden layout.
 *  - Return a cleanup (typically `() => mm.revert()`); it runs on unmount, even if GSAP had not finished loading.
 *  - Animate transform/opacity only; never layout properties.
 */
export interface GsapApi {
  gsap: typeof GsapCore;
  ScrollTrigger: typeof ScrollTriggerPlugin;
}

let loading: Promise<GsapApi> | null = null;

export function loadGsap(): Promise<GsapApi> {
  loading ??= Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
    ([{ gsap }, { ScrollTrigger }]) => {
      gsap.registerPlugin(ScrollTrigger);
      return { gsap, ScrollTrigger };
    },
  );
  return loading;
}

type Idle = { cancel: () => void };

/** Run `fn` when the main thread is idle (falls back to a short timeout where requestIdleCallback is missing). */
function whenIdle(fn: () => void): Idle {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout: 1500 });
    return { cancel: () => window.cancelIdleCallback(id) };
  }
  const id = window.setTimeout(fn, 150);
  return { cancel: () => window.clearTimeout(id) };
}

/**
 * Runs `setup` once GSAP is available (after hydration, in idle time). Callers pass plain inline functions: the hook
 * keeps the latest ones in a ref and the effect runs exactly once per mount.
 * `prepare`, when provided, runs first on the client and may return true to skip loading GSAP altogether
 * (used for reduced motion, where the static end state is applied directly).
 */
export function useGsapEffect(
  setup: (api: GsapApi) => void | (() => void),
  prepare?: () => boolean,
): void {
  const latest = React.useRef({ setup, prepare });
  React.useEffect(() => {
    latest.current = { setup, prepare };
  });

  React.useEffect(() => {
    if (latest.current.prepare?.()) return;
    let cancelled = false;
    let cleanup: void | (() => void);
    let second: Idle | undefined;
    // Two idle hops: one to fetch GSAP, then one PER component to run its setup. Without the second hop ~25 components
    // initialise in a single long task right after the library arrives (measured as blocking time in Lighthouse).
    const first = whenIdle(() => {
      void loadGsap().then((api) => {
        if (cancelled) return;
        second = whenIdle(() => {
          if (!cancelled) cleanup = latest.current.setup(api);
        });
      });
    });
    return () => {
      cancelled = true;
      first.cancel();
      second?.cancel();
      if (typeof cleanup === "function") cleanup();
    };
  }, []);
}
