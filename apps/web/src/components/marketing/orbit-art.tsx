import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Original artwork for the Midnight Violet hero: AI agents in orbit around a control core, with a single checkpoint on
 * the axis that every orbit must pass through. Purely decorative (aria-hidden), drawn from design tokens only (no hex),
 * and mostly still: four small dots drift along the orbits and the checkpoint breathes. Both rest under reduced motion.
 *
 * Composition: a horizon. The core sits low in the frame so the upper halves of the orbits arc above it like a rising
 * planet, and the lower halves are cropped by the section edge.
 */

const W = 1200;
const H = 560;
const CX = 600;
const CY = 440;
const CORE_R = 112;

interface Orbit {
  rx: number;
  ry: number;
}

const ORBITS: readonly Orbit[] = [
  { rx: 200, ry: 58 },
  { rx: 330, ry: 96 },
  { rx: 470, ry: 138 },
  { rx: 610, ry: 182 },
];

/** Point on an orbit at `deg` degrees (0 = right, 90 = below the core, 270 = above it). */
function at(orbit: Orbit, deg: number): { x: number; y: number } {
  const t = (deg * Math.PI) / 180;
  return { x: CX + orbit.rx * Math.cos(t), y: CY + orbit.ry * Math.sin(t) };
}

/** A full ellipse as an SVG path, starting at the rightmost point and running clockwise. */
function ellipsePath(o: Orbit): string {
  return `M ${CX + o.rx} ${CY} A ${o.rx} ${o.ry} 0 1 1 ${CX - o.rx} ${CY} A ${o.rx} ${o.ry} 0 1 1 ${CX + o.rx} ${CY} Z`;
}

/** Upper (behind the core) and lower (in front of it) halves, so the core can sit between them. */
const back = (o: Orbit) => `M ${CX - o.rx} ${CY} A ${o.rx} ${o.ry} 0 0 1 ${CX + o.rx} ${CY}`;
const front = (o: Orbit) => `M ${CX + o.rx} ${CY} A ${o.rx} ${o.ry} 0 0 1 ${CX - o.rx} ${CY}`;

/** Agents: which orbit, where on it, and how prominent. Positions double as anchors for the floating labels. */
export const AGENT_NODES = [
  { orbit: 1, deg: 208, r: 6, label: "Lead Intake Agent", state: "Needs approval" },
  { orbit: 1, deg: 330, r: 5, label: "Inbound Qualifier", state: "Allowed" },
  { orbit: 3, deg: 238, r: 5, label: "Legacy Import Agent", state: "Blocked" },
  { orbit: 0, deg: 214, r: 4, label: "", state: "" },
  { orbit: 3, deg: 322, r: 4, label: "", state: "" },
  { orbit: 2, deg: 300, r: 3.5, label: "", state: "" },
  { orbit: 2, deg: 205, r: 3.5, label: "", state: "" },
  { orbit: 3, deg: 285, r: 3, label: "", state: "" },
] as const;

export function nodePoint(i: number) {
  const n = AGENT_NODES[i]!;
  return at(ORBITS[n.orbit]!, n.deg);
}

const STATE_FILL: Record<string, string> = {
  "Needs approval": "fill-warning",
  Allowed: "fill-success",
  Blocked: "fill-danger",
};

/** Drifting dots: orbit index, seconds per lap, starting offset. */
const DRIFTERS = [
  { orbit: 1, duration: 46, delay: -8 },
  { orbit: 2, duration: 64, delay: -30 },
  { orbit: 3, duration: 88, delay: -52 },
  { orbit: 0, duration: 32, delay: -14 },
] as const;

/** Tiny fixed "stars": a hand-placed scatter, so server and client always render the same thing. */
const STARS: ReadonlyArray<readonly [number, number, number]> = [
  [90, 60, 1.2],
  [210, 140, 1],
  [340, 48, 1.4],
  [470, 96, 1],
  [720, 70, 1.2],
  [860, 130, 1],
  [990, 52, 1.4],
  [1100, 118, 1],
  [150, 250, 1],
  [1060, 250, 1.2],
  [540, 24, 1],
  [660, 150, 0.9],
];

export function OrbitArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
      className={cn(
        "block h-full w-full [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]",
        className,
      )}
    >
      <defs>
        <linearGradient id="orbit-axis" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--primary-text)", stopOpacity: 0 }} />
          <stop offset="0.7" style={{ stopColor: "var(--primary-text)", stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: "var(--primary-text)", stopOpacity: 0.9 }} />
        </linearGradient>
        <radialGradient id="orbit-core" cx="0.42" cy="0.3" r="0.9">
          <stop offset="0" style={{ stopColor: "var(--border-strong)", stopOpacity: 1 }} />
          <stop offset="0.55" style={{ stopColor: "var(--surface)", stopOpacity: 1 }} />
          <stop offset="1" style={{ stopColor: "var(--background)", stopOpacity: 1 }} />
        </radialGradient>
        <linearGradient id="orbit-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--primary-text)", stopOpacity: 0.95 }} />
          <stop offset="0.45" style={{ stopColor: "var(--primary)", stopOpacity: 0.35 }} />
          <stop offset="1" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
        </linearGradient>
        <radialGradient id="orbit-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.55" style={{ stopColor: "var(--primary)", stopOpacity: 0.22 }} />
          <stop offset="1" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
        </radialGradient>
      </defs>

      <g>
        {/* stars */}
        {STARS.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} className="fill-foreground/35" />
        ))}

        {/* halo behind the core */}
        <circle cx={CX} cy={CY} r={CORE_R * 2.3} fill="url(#orbit-halo)" />

        {/* back halves of the orbits */}
        {ORBITS.map((o, i) => (
          <path
            key={`b${i}`}
            d={back(o)}
            fill="none"
            strokeWidth="1"
            className={i % 2 === 0 ? "stroke-foreground/16" : "stroke-foreground/10"}
          />
        ))}

        {/* axis + control point */}
        <line x1={CX} y1="20" x2={CX} y2={CY - CORE_R} stroke="url(#orbit-axis)" strokeWidth="1" />
        <g className="orbit-breathe">
          <rect
            x={CX - 22}
            y={CY - ORBITS[3]!.ry - 1}
            width="44"
            height="2"
            rx="1"
            className="fill-primary-text"
          />
          <rect
            x={CX - 1}
            y={CY - ORBITS[3]!.ry - 9}
            width="2"
            height="18"
            rx="1"
            className="fill-primary-text"
          />
        </g>

        {/* the core */}
        <circle cx={CX} cy={CY} r={CORE_R} fill="url(#orbit-core)" />
        <path
          d={`M ${CX - CORE_R} ${CY} A ${CORE_R} ${CORE_R} 0 0 1 ${CX + CORE_R} ${CY}`}
          fill="none"
          stroke="url(#orbit-rim)"
          strokeWidth="1.5"
        />
        <circle
          cx={CX}
          cy={CY}
          r={CORE_R * 0.62}
          fill="none"
          strokeWidth="1"
          className="stroke-foreground/10"
        />

        {/* front halves of the orbits pass in front of the core */}
        {ORBITS.map((o, i) => (
          <path
            key={`f${i}`}
            d={front(o)}
            fill="none"
            strokeWidth="1"
            className={i % 2 === 0 ? "stroke-foreground/25" : "stroke-foreground/16"}
          />
        ))}

        {/* agents */}
        {AGENT_NODES.map((n, i) => {
          const p = nodePoint(i);
          const prominent = n.label !== "";
          return (
            <g key={i}>
              {prominent ? (
                <circle cx={p.x} cy={p.y} r={n.r + 7} className="fill-primary/15" />
              ) : null}
              <circle
                cx={p.x}
                cy={p.y}
                r={n.r}
                className={prominent ? "fill-primary-text" : "fill-foreground/55"}
              />
            </g>
          );
        })}

        {/* floating labels: the three answers an agent can get (decorative; hidden on small screens where they would crowd the art) */}
        <g className="hidden md:inline">
          {AGENT_NODES.map((n, i) => {
            if (!n.label) return null;
            const p = nodePoint(i);
            const text = `${n.label}  ·  ${n.state}`;
            const w = text.length * 6.6 + 44;
            const x = p.x - w / 2;
            const y = p.y - 52;
            return (
              <g key={n.label}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height="30"
                  rx="15"
                  className="fill-surface/80 stroke-border"
                  strokeWidth="1"
                />
                <circle cx={x + 17} cy={y + 15} r="3.5" className={STATE_FILL[n.state]} />
                <text
                  x={x + 30}
                  y={y + 19.5}
                  fontSize="12.5"
                  className="fill-foreground"
                  style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
                >
                  {n.label}
                  <tspan className="fill-muted-foreground">{"  ·  " + n.state}</tspan>
                </text>
              </g>
            );
          })}
        </g>

        {/* drifting dots */}
        {DRIFTERS.map((d, i) => (
          <circle
            key={i}
            cx="0"
            cy="0"
            r="2.5"
            className="orbit-dot fill-foreground"
            style={
              {
                offsetPath: `path("${ellipsePath(ORBITS[d.orbit]!)}")`,
                "--orbit-duration": `${d.duration}s`,
                "--orbit-delay": `${d.delay}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </g>
    </svg>
  );
}
