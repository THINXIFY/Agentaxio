/**
 * Isometric (2:1) geometry helpers for the hero artwork. Pure functions so the maths is unit-tested
 * and the SVG/GSAP code only consumes coordinates.
 */
export type Pt = readonly [number, number];

export interface Plane {
  cx: number;
  cy: number;
  /** Half of the plane's on-screen width (distance centre → left/right vertex). */
  halfW: number;
  /** Half of the plane's on-screen height (distance centre → top/bottom vertex). */
  halfH: number;
}

/** Corner vertices: left, top, right, bottom. */
export function planeVertices({ cx, cy, halfW, halfH }: Plane): [Pt, Pt, Pt, Pt] {
  return [
    [cx - halfW, cy],
    [cx, cy - halfH],
    [cx + halfW, cy],
    [cx, cy + halfH],
  ];
}

/**
 * Maps plane-local coordinates (a, b ∈ [0,1]) to screen space.
 * (0,0) = left vertex, (1,0) = top vertex, (0,1) = bottom vertex, (0.5,0.5) = centre.
 */
export function planePoint({ cx, cy, halfW, halfH }: Plane, a: number, b: number): Pt {
  return [cx - halfW + (a + b) * halfW, cy + (b - a) * halfH];
}

export function polylineLength(points: readonly Pt[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    total += Math.hypot(x1 - x0, y1 - y0);
  }
  return total;
}

/** Point at fraction t ∈ [0,1] of the polyline's total length (clamped). */
export function pointAt(points: readonly Pt[], t: number): Pt {
  if (points.length === 0) return [0, 0];
  if (points.length === 1) return points[0]!;
  const target = Math.min(1, Math.max(0, t)) * polylineLength(points);
  let walked = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (walked + seg >= target) {
      const f = seg === 0 ? 0 : (target - walked) / seg;
      return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
    }
    walked += seg;
  }
  return points[points.length - 1]!;
}

/** Fraction of the polyline's length at which vertex `index` sits. */
export function fractionAtVertex(points: readonly Pt[], index: number): number {
  const total = polylineLength(points);
  if (total === 0) return 0;
  return polylineLength(points.slice(0, index + 1)) / total;
}
