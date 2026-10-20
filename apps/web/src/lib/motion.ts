/**
 * Motion constants shared with GSAP code. Values mirror --motion-* in styles/tokens.css
 * (GSAP takes seconds; CSS takes ms). Change both together.
 */
export const DURATION = {
  fast: 0.12,
  base: 0.2,
  slow: 0.6,
  reveal: 0.9,
} as const;

/** GSAP-compatible easings corresponding to --motion-ease-standard / --motion-ease-emphasized. */
export const EASE = {
  standard: "power2.out",
  emphasized: "expo.out",
} as const;

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const NO_PREFERENCE_MOTION_QUERY = "(prefers-reduced-motion: no-preference)";
