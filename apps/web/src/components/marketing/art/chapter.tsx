import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Reveal } from "@/components/motion/reveal";
import { Heading } from "@/components/ui/typography";
import { cn } from "@/lib/cn";

/**
 * FE-09 page structure: editorial, not templated.
 *
 * A page is a short hero followed by numbered chapters. Each chapter keeps its index and label in a narrow left margin
 * (like a printed specification) and its content in the wider column beside it, so the page reads as a document with a
 * product shown inside it, rather than a stack of centred bands.
 */

const rise = (delayMs: number, risePx?: string) =>
  ({ "--d": `${delayMs}ms`, ...(risePx ? { "--rise": risePx } : {}) }) as React.CSSProperties;

export function IndexMark({
  index,
  label,
  className,
}: {
  index: string;
  label: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase lg:sticky lg:top-24",
        className,
      )}
    >
      <span className="text-primary-text">{index}</span>
      <span className="ml-2.5">{label}</span>
    </p>
  );
}

/** Running text with a readable measure. */
export function Prose({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "max-w-[62ch] space-y-4 text-[1.0625rem] leading-relaxed text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A numbered chapter of a page. `wide` lets the content use the full width under the heading (for diagrams and product
 * demonstrations); otherwise it sits in the main column beside the index.
 */
export function Chapter({
  id,
  index,
  label,
  title,
  lead,
  tone = "light",
  round = false,
  wide = false,
  className,
  children,
}: {
  id: string;
  index: string;
  label: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  tone?: "light" | "dark";
  /** Overlap the section above with a rounded top edge: a softer hand-off between a dark and a light section. */
  round?: boolean;
  wide?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const titleId = `${id}-title`;
  return (
    <Section
      id={id}
      tone={tone}
      aria-labelledby={titleId}
      className={cn(
        "scroll-mt-28 py-12 sm:py-[4.5rem]",
        round && "relative z-10 -mt-5 rounded-t-panel",
        className,
      )}
    >
      <Container>
        <div
          className={cn(
            "grid grid-cols-1 gap-x-10 gap-y-5 pt-6 lg:grid-cols-12 lg:pt-8",
            !round && "border-t border-border-strong/60",
          )}
        >
          <div className="lg:col-span-2">
            <IndexMark index={index} label={label} />
          </div>
          <Reveal className="lg:col-span-8">
            <Heading id={titleId} level={2} size="chapter" className="max-w-[24ch]">
              {title}
            </Heading>
            {lead ? (
              <p className="mt-4 max-w-[58ch] text-[1.0625rem] leading-relaxed text-muted-foreground">
                {lead}
              </p>
            ) : null}
          </Reveal>
          {children ? (
            <div
              className={cn(
                "mt-4 lg:mt-8",
                wide ? "lg:col-span-12" : "lg:col-span-10 lg:col-start-3",
              )}
            >
              {children}
            </div>
          ) : null}
        </div>
      </Container>
    </Section>
  );
}

/**
 * Opening of a page. Left-aligned and restrained: a small label, a title that does not shout, one paragraph that says
 * what the page is for. Anything that needs showing (a flow, an architecture) goes in `children`, full width, as the
 * page's first real content.
 */
export function ArtHero({
  label,
  title,
  lead,
  children,
}: {
  label: string;
  title: React.ReactNode;
  lead: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Section
      tone="dark"
      spacing="none"
      aria-labelledby="page-title"
      className="-mt-(--topbar-height) pt-[calc(var(--topbar-height)+3rem)] pb-16 sm:pt-[calc(var(--topbar-height)+4.5rem)] sm:pb-24"
    >
      {/* One soft light from the top left. No grid, no second glow. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-[36rem] bg-[radial-gradient(48%_70%_at_18%_0%,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_72%)]"
      />
      <Container>
        <div className="grid grid-cols-1 gap-x-10 gap-y-5 lg:grid-cols-12">
          <p
            className="hero-rise font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase lg:col-span-2 lg:pt-3"
            style={rise(0, "10px")}
          >
            <span className="text-primary-text">00</span>
            <span className="ml-2.5">{label}</span>
          </p>
          <div className="lg:col-span-9">
            <div className="hero-rise" style={rise(80, "22px")}>
              <Heading id="page-title" level={1} size="page" className="max-w-[19ch]">
                {title}
              </Heading>
            </div>
            <p
              className="hero-rise mt-5 max-w-[58ch] text-[1.1875rem] leading-relaxed text-muted-foreground"
              style={rise(200)}
            >
              {lead}
            </p>
          </div>
        </div>
        {children ? (
          <div className="hero-rise mt-12 sm:mt-16" style={rise(340, "28px")}>
            {children}
          </div>
        ) : null}
      </Container>
    </Section>
  );
}

const STATUS = {
  built: { label: "Built", dot: "bg-success" },
  demo: { label: "Demo UI", dot: "bg-primary" },
  designed: { label: "Designed", dot: "bg-warning" },
  planned: { label: "Planned", dot: "bg-muted-foreground" },
  proposed: { label: "Proposed", dot: "bg-info" },
} as const;

export type StatusKind = keyof typeof STATUS;

/** A status word with a dot: quieter than a pill, so it can sit inside running text and tables. Text always carries the meaning. */
export function StatusMark({
  status,
  children,
  className,
}: {
  status: StatusKind;
  children?: React.ReactNode;
  className?: string;
}) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-xs whitespace-nowrap",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", s.dot)} />
      {children ?? s.label}
    </span>
  );
}

/**
 * One line that says how real the page is, with the legend for the status words used on it. It replaces a pill on every
 * block: the disclosure is stated once, clearly, and the words are then used consistently.
 */
export function StatusStrip({
  children,
  kinds = ["built", "demo", "designed", "planned"],
}: {
  children: React.ReactNode;
  kinds?: readonly StatusKind[];
}) {
  return (
    <aside
      aria-label="How to read this page"
      className="flex flex-col gap-3 border-y border-border py-4 text-sm leading-relaxed text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-8"
    >
      <p className="max-w-[60ch]">{children}</p>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-foreground">
        {kinds.map((k) => (
          <li key={k}>
            <StatusMark status={k} />
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** A quiet row of arrow links: how a page ends, instead of a centred call-to-action band. */
export function ArrowLinks({
  links,
  className,
}: {
  links: ReadonlyArray<{ href: string; label: string }>;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap gap-x-8 gap-y-3 text-base", className)}>
      {links.map((l) => (
        <li key={l.href}>
          <Link
            href={l.href}
            className="group inline-flex items-center gap-2 font-medium text-primary-text underline-offset-4 hover:underline"
          >
            {l.label}
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform duration-200 ease-standard group-hover:translate-x-0.5"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
