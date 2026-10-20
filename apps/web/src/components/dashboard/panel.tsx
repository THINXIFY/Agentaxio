import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A titled dashboard panel: one tonal step above the workspace with only a faint hairline, a quiet header and an optional
 * "see all" link. `flush` removes body padding for lists that manage their own row padding.
 */
export function Panel({
  id,
  title,
  description,
  action,
  aside,
  flush = false,
  className,
  bodyClassName,
  children,
}: {
  /** Used to label the section; must be unique on the page. */
  id: string;
  title: string;
  description?: string;
  action?: { href: string; label: string };
  /** Small element beside the title, e.g. a help popover. */
  aside?: React.ReactNode;
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const headingId = `${id}-title`;
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex min-w-0 flex-col rounded-card border border-border/60 bg-surface shadow-raised",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-6 pt-6 pb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 id={headingId} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            {aside}
          </div>
          {description ? (
            <p className="mt-1 text-[0.9375rem] leading-snug text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? (
          <Link
            href={action.href}
            className="group inline-flex shrink-0 items-center gap-1.5 rounded-sm py-1 text-base font-medium text-primary-text hover:underline"
          >
            {action.label}
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform duration-200 ease-standard group-hover:translate-x-0.5"
            />
          </Link>
        ) : null}
      </header>
      <div className={cn("min-w-0 flex-1", flush ? "" : "px-6 pb-6", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
