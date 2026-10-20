import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Sparkline } from "@/components/dashboard/charts";
import { cn } from "@/lib/cn";

/**
 * Overview summary card: a label, one big number and one plain sentence. The whole card is a single link (stretched
 * pseudo-element on the label), so there is one tab stop and the label is the accessible name.
 */
export function MetricCard({
  title,
  value,
  helper,
  href,
  linkLabel,
  tone = "neutral",
  trend,
  className,
}: {
  title: string;
  value: React.ReactNode;
  /** One short sentence under the number. */
  helper: string;
  href: string;
  /** Where the card goes, for assistive tech: "view all agents". */
  linkLabel: string;
  /** Adds a small coloured dot for things that need attention; the helper text still carries the meaning. */
  tone?: "neutral" | "attention" | "blocked";
  /** Optional sample trend line beside the number. Decorative: the number and sentence carry the meaning. */
  trend?: readonly number[];
  className?: string;
}) {
  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-card border border-border/60 bg-surface p-6 shadow-raised",
        "transition-[background-color,border-color] duration-200 ease-standard",
        "focus-within:border-border-strong hover:bg-surface-hover",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-base font-medium text-muted-foreground">
          {tone !== "neutral" ? (
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full",
                tone === "attention" ? "bg-warning" : "bg-danger",
              )}
            />
          ) : null}
          <Link
            href={href}
            aria-label={`${title}: ${linkLabel}`}
            className="rounded-sm after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
          >
            {title}
          </Link>
        </h2>
        <ArrowUpRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-[transform,color] duration-200 ease-standard group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
        />
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <p className="font-display text-5xl leading-none font-semibold tracking-tight">{value}</p>
        {trend ? <Sparkline values={trend} /> : null}
      </div>
      <p className="mt-3 text-base leading-snug text-muted-foreground">{helper}</p>
    </article>
  );
}

export function MetricCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-card border border-border/60 bg-surface p-6"
    >
      <div className="h-4 w-32 rounded bg-surface-sunken" />
      <div className="mt-5 h-12 w-16 rounded bg-surface-sunken" />
      <div className="mt-4 h-4 w-40 rounded bg-surface-sunken" />
    </div>
  );
}
