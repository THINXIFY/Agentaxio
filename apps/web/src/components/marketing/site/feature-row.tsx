import * as React from "react";
import { Check } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Window } from "@/components/marketing/site/blocks";
import { Reveal } from "@/components/motion/reveal";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";
import { cn } from "@/lib/cn";

/**
 * One idea, told with words on one side and a sample visual on the other. Two treatments keep a long page from becoming a
 * stack of identical cards:
 *
 *  - "window"  the visual sits in a titled frame with a status pill (feature pages)
 *  - "plain"   a large numeral and an open, unframed visual on a quiet well (platform overview)
 */
export function FeatureRow({
  id,
  tone,
  n,
  eyebrow,
  title,
  text,
  points,
  visual,
  visualTitle,
  status,
  flip = false,
  variant = "window",
}: {
  id?: string;
  tone: "light" | "dark";
  n?: string;
  eyebrow?: string;
  title: string;
  text: string;
  points?: readonly string[];
  visual: React.ReactNode;
  visualTitle?: string;
  status?: React.ReactNode;
  flip?: boolean;
  variant?: "window" | "plain";
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <Section
      id={id}
      tone={tone}
      aria-labelledby={headingId}
      className="scroll-mt-28 py-16 sm:py-24"
    >
      <Container className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-16">
        <Reveal className={cn("lg:col-span-5", flip && "lg:order-2")}>
          {variant === "plain" && n ? (
            <p
              aria-hidden="true"
              className="text-outline font-display text-7xl leading-none font-semibold select-none"
            >
              {n}
            </p>
          ) : null}
          {eyebrow ? (
            <Eyebrow className={variant === "plain" ? "mt-5" : undefined}>{eyebrow}</Eyebrow>
          ) : null}
          <Heading id={headingId} level={2} size="display-sm" className="mt-4">
            {title}
          </Heading>
          <Text variant="lead" className="mt-4 text-pretty">
            {text}
          </Text>
          {points?.length ? (
            <ul className="mt-6 space-y-3">
              {points.map((p) => (
                <li key={p} className="flex gap-3 text-base leading-relaxed">
                  <Check className="mt-1.5 size-4 shrink-0 text-primary-text" aria-hidden="true" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Reveal>

        <Reveal y={36} delay={0.08} className={cn("lg:col-span-7", flip && "lg:order-1")}>
          {variant === "window" ? (
            <Window title={visualTitle ?? "Illustration"} status={status}>
              {visual}
            </Window>
          ) : (
            <div className="rounded-card bg-surface-sunken p-6 sm:p-8">
              {status ? <div className="mb-5">{status}</div> : null}
              {visual}
            </div>
          )}
        </Reveal>
      </Container>
    </Section>
  );
}
