import { describe, expect, it } from "vitest";
import {
  fractionAtVertex,
  planePoint,
  planeVertices,
  pointAt,
  polylineLength,
  type Plane,
  type Pt,
} from "@/lib/iso";

const plane: Plane = { cx: 300, cy: 200, halfW: 280, halfH: 140 };

describe("planePoint", () => {
  it("maps the corners and centre of plane space onto the diamond", () => {
    expect(planePoint(plane, 0, 0)).toEqual([20, 200]); // left
    expect(planePoint(plane, 1, 0)).toEqual([300, 60]); // top
    expect(planePoint(plane, 0, 1)).toEqual([300, 340]); // bottom
    expect(planePoint(plane, 1, 1)).toEqual([580, 200]); // right
    expect(planePoint(plane, 0.5, 0.5)).toEqual([300, 200]); // centre
  });

  it("agrees with planeVertices", () => {
    const [l, t, r, b] = planeVertices(plane);
    expect(l).toEqual(planePoint(plane, 0, 0));
    expect(t).toEqual(planePoint(plane, 1, 0));
    expect(r).toEqual(planePoint(plane, 1, 1));
    expect(b).toEqual(planePoint(plane, 0, 1));
  });

  it("keeps every in-range point inside the diamond", () => {
    for (let a = 0; a <= 1; a += 0.1) {
      for (let b = 0; b <= 1; b += 0.1) {
        const [x, y] = planePoint(plane, a, b);
        const inside = Math.abs(x - plane.cx) / plane.halfW + Math.abs(y - plane.cy) / plane.halfH;
        expect(inside).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});

describe("polyline helpers", () => {
  const path: Pt[] = [
    [0, 0],
    [30, 40], // length 50
    [30, 90], // length 50
  ];

  it("measures total length", () => {
    expect(polylineLength(path)).toBe(100);
  });

  it("interpolates by length, clamping out-of-range t", () => {
    expect(pointAt(path, 0)).toEqual([0, 0]);
    expect(pointAt(path, 0.25)).toEqual([15, 20]);
    expect(pointAt(path, 0.5)).toEqual([30, 40]);
    expect(pointAt(path, 1)).toEqual([30, 90]);
    expect(pointAt(path, -3)).toEqual([0, 0]);
    expect(pointAt(path, 9)).toEqual([30, 90]);
  });

  it("reports the fraction of length at a vertex", () => {
    expect(fractionAtVertex(path, 0)).toBe(0);
    expect(fractionAtVertex(path, 1)).toBe(0.5);
    expect(fractionAtVertex(path, 2)).toBe(1);
  });

  it("handles degenerate input", () => {
    expect(pointAt([], 0.5)).toEqual([0, 0]);
    expect(pointAt([[5, 5]], 0.5)).toEqual([5, 5]);
    expect(fractionAtVertex([[1, 1]], 0)).toBe(0);
  });
});
