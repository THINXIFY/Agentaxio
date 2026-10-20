import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";
import { cn } from "@/lib/cn";

/** Eyebrow, heading and lead for a content section, revealed on scroll. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  align = "left",
  className,
}: {
  /** Id of the heading element, so a section can be labelled by it. */
  id?: string;
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <Reveal className={cn(align === "center" && "mx-auto text-center", "max-w-3xl", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Heading id={id} level={2} size="display-md" className={eyebrow ? "mt-5" : undefined}>
        {title}
      </Heading>
      {lead ? (
        <Text variant="lead" className="mt-5 text-pretty">
          {lead}
        </Text>
      ) : null}
    </Reveal>
  );
}

/**
 * A framed panel for diagrams and sample UI. The title bar says what it is and the status pill says how real it is, so a
 * visual can never be mistaken for a working product.
 */
export function Window({
  title,
  status,
  children,
  className,
}: {
  title: string;
  status?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-card border border-border bg-surface shadow-floating",
        className,
      )}
    >
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <span className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
          {title}
        </span>
        {status}
      </figcaption>
      <div className="p-5 sm:p-6">{children}</div>
    </figure>
  );
}

/** Closing band shared by the marketing pages. Primary action first, a quieter alternative second. */
export function PageCta({
  title,
  text,
  primary,
  secondary,
}: {
  title: string;
  text: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <Section
      tone="dark"
      aria-labelledby="page-cta-title"
      className="border-t border-border py-20 sm:py-28"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-[80%] bg-[radial-gradient(55%_100%_at_50%_100%,color-mix(in_srgb,var(--primary)_16%,transparent),transparent)]"
      />
      <Container className="text-center">
        <Reveal>
          <Heading id="page-cta-title" level={2} size="display-md" className="mx-auto max-w-2xl">
            {title}
          </Heading>
          <Text variant="lead" className="mx-auto mt-5 max-w-xl text-pretty">
            {text}
          </Text>
        </Reveal>
        <Reveal
          delay={0.1}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href={primary.href}>
              {primary.label} <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          {secondary ? (
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href={secondary.href}>{secondary.label}</Link>
            </Button>
          ) : null}
        </Reveal>
      </Container>
    </Section>
  );
}

/** Small mono label used above groups inside sections. */
export function MonoLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}
