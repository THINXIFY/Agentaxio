import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";
import { HOME_SECTION_IDS } from "@/config/navigation";

/** Grounded in docs/ROADMAP.md (phase 9) and docs/PRD.md (business validation, open decisions). No prices or tiers exist. */
const DECIDED = [
  "Plans will meter usage. They will never change how policy is evaluated.",
  "Billing is built after the authorization core and the private beta.",
  "Pricing is validated with n8n agencies and AI developers before it is set.",
] as const;

const OPEN = [
  "Billing provider and supported countries",
  "Plan structure and usage limits",
  "Prices and trial terms",
  "Whether a free sandbox tier exists",
] as const;

export function PricingSection() {
  return (
    <Section
      id={HOME_SECTION_IDS.pricing}
      tone="light"
      aria-labelledby="pricing-title"
      className="relative z-10 -mt-5 rounded-t-panel"
    >
      <Container className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-10">
        <Reveal className="lg:col-span-5">
          <Eyebrow>Pricing preview</Eyebrow>
          <Heading id="pricing-title" level={2} size="display-md" className="mt-5">
            Pricing isn’t set yet. Here is what is.
          </Heading>
          <Text variant="lead" className="mt-6 max-w-md">
            We would rather tell you what is open than show a price list for a product that is still
            being built.
          </Text>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild>
              <Link href="/dashboard">
                Explore the demo <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <span
              aria-disabled="true"
              className="inline-flex h-10 cursor-not-allowed items-center rounded-control border border-dashed border-border-strong px-4 text-sm text-muted-foreground"
            >
              Plans and prices · not published
            </span>
          </div>
        </Reveal>

        <Reveal y={36} delay={0.1} className="lg:col-span-7">
          <div className="grid border-y border-foreground md:grid-cols-2 md:divide-x md:divide-foreground/15">
            <div className="py-8 md:pr-8">
              <h3 className="font-mono text-xs tracking-[0.14em] text-primary-text uppercase">
                Decided
              </h3>
              <ul className="mt-5 space-y-4">
                {DECIDED.map((d) => (
                  <li key={d} className="flex gap-3 text-base leading-relaxed">
                    <Check className="mt-1 size-4 shrink-0 text-foreground" aria-hidden="true" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-foreground/15 py-8 md:border-t-0 md:pl-8">
              <h3 className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
                Still open
              </h3>
              <ul className="mt-5 space-y-4">
                {OPEN.map((o) => (
                  <li
                    key={o}
                    className="flex gap-3 text-base leading-relaxed text-muted-foreground"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2 size-2.5 shrink-0 rounded-full border border-dashed border-foreground/50"
                    />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
