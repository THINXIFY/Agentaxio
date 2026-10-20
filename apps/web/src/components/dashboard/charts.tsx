import * as React from "react";
import { cn } from "@/lib/cn";
import type { DayOutcomes } from "@/mocks/dashboard";

/**
 * Minimal charts. They draw from tokens only, carry a text alternative and a visible legend, and show sample numbers.
 * No axes to read, no gridlines beyond a hairline baseline: they support the sentence next to them instead of replacing it.
 */

/** Tiny trend line under a summary number. Decorative: the figure and its sentence carry the meaning. */
export function Sparkline({
  values,
  className,
}: {
  values: readonly number[];
  className?: string;
}) {
  const w = 120;
  const h = 36;
  const pad = 3;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const last = pts[pts.length - 1]!;
  const first = pts[0]!;
  const area = `${line} L${last[0].toFixed(1)} ${h} L${first[0].toFixed(1)} ${h} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      focusable="false"
      className={cn("h-9 w-[7.5rem] shrink-0", className)}
    >
      <path d={area} className="fill-primary/10" />
      <path
        d={line}
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-text"
      />
      <circle cx={last[0]} cy={last[1]} r="2.5" className="fill-primary-text" />
    </svg>
  );
}

const SERIES = [
  { key: "allowed", label: "Allowed", swatch: "bg-primary" },
  { key: "approval", label: "Needs approval", swatch: "bg-warning" },
  { key: "blocked", label: "Blocked", swatch: "bg-danger" },
] as const;

/** One stacked bar per day, with the exact figures available as a hidden table. */
export function RequestsChart({
  data,
  caption,
}: {
  data: readonly DayOutcomes[];
  caption: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.allowed + d.approval + d.blocked));
  const totals = SERIES.map((s) => ({
    ...s,
    total: data.reduce((sum, d) => sum + d[s.key], 0),
  }));
  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>

      <ul className="mb-6 flex flex-wrap gap-x-7 gap-y-2.5">
        {totals.map((s) => (
          <li key={s.key} className="flex items-center gap-2.5 text-base">
            <span aria-hidden="true" className={cn("size-2.5 rounded-full", s.swatch)} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-medium">{s.total}</span>
          </li>
        ))}
      </ul>

      <div
        aria-hidden="true"
        className="flex h-44 items-end justify-around gap-2 border-b border-border sm:gap-4"
      >
        {data.map((d) => {
          const total = d.allowed + d.approval + d.blocked;
          return (
            <div
              key={d.date}
              className="mx-auto flex h-full w-full max-w-[4.5rem] min-w-0 flex-1 flex-col justify-end"
            >
              <div
                className="flex flex-col justify-end gap-0.5"
                style={{ height: `${(total / max) * 100}%` }}
              >
                {[...SERIES]
                  .reverse()
                  .map((s) =>
                    d[s.key] > 0 ? (
                      <div
                        key={s.key}
                        className={cn(
                          "w-full rounded-[0.1875rem] first:rounded-t-md last:rounded-b-none",
                          s.swatch,
                          s.key === "allowed" ? "opacity-90" : "opacity-80",
                        )}
                        style={{ flexGrow: d[s.key], flexBasis: 0, minHeight: 3 }}
                      />
                    ) : null,
                  )}
              </div>
            </div>
          );
        })}
      </div>
      <div
        aria-hidden="true"
        className="mt-2.5 flex justify-around gap-2 text-sm text-muted-foreground sm:gap-4"
      >
        {data.map((d) => (
          <span key={d.date} className="mx-auto w-full max-w-[4.5rem] min-w-0 flex-1 text-center">
            {d.label}
          </span>
        ))}
      </div>

      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              {SERIES.map((s) => (
                <th key={s.key} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.date}>
                <th scope="row">{d.label}</th>
                {SERIES.map((s) => (
                  <td key={s.key}>{d[s.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
