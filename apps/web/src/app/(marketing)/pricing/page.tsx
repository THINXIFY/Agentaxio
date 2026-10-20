import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { MonoLabel, PageCta, SectionHeading } from "@/components/marketing/site/blocks";
import { Callout } from "@/components/marketing/site/callout";
import { PageHero } from "@/components/marketing/site/page-hero";
import { StatusPill } from "@/components/marketing/site/status-pill";
import { Reveal, RevealStagger } from "@/components/motion/reveal";
import { Heading } from "@/components/ui/typography";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "AgentAxio pricing has not been decided. Here is how plans may differ, and what will not depend on your plan.",
};

const SHAPES = [
  {
    name: "Builder",
    who: "One person or a small team trying AgentAxio with a few agents.",
    emphasis: ["A small number of agents", "Basic approvals", "Shorter activity history"],
  },
  {
    name: "Team",
    who: "A team running agents for real work, with several people reviewing requests.",
    emphasis: ["More agents and environments", "Several approvers", "Longer activity history"],
  },
  {
    name: "Organization",
    who: "A company or agency with many agents, clients or business units.",
    emphasis: [
      "Many agents and environments",
      "Approval roles across teams",
      "Extended history and support",
    ],
  },
] as const;

const DIMENSIONS = [
  { name: "Agents", note: "How many agents you can register." },
  { name: "Environments", note: "Separate spaces such as dev and staging." },
  { name: "Approvers", note: "How many people can review requests." },
  { name: "Activity history", note: "How long records are kept in the dashboard." },
  { name: "Integrations", note: "Which enforcement points are available." },
  { name: "Support", note: "How quickly and how directly we respond." },
] as const;

const FAQ = [
  {
    q: "When will pricing be published?",
    a: "It has not been decided. We will publish prices before any paid plan opens, and not before the product is ready to be used for real.",
  },
  {
    q: "Is there a free plan or a trial?",
    a: "Not decided. Today the only thing you can try is the demo dashboard, which runs on invented sample data.",
  },
  {
    q: "Can I sign up or pay now?",
    a: "No. There are no accounts and no billing yet. Nothing on this page is an offer.",
  },
  {
    q: "Will you charge per request?",
    a: "We expect usage to play some part, for example in how many agents or requests a plan covers. How exactly is still open.",
  },
  {
    q: "Will a cheaper plan make the rules weaker?",
    a: "No. Plans may limit how much you can use. They will never change how rules are evaluated or relax the default of blocking.",
  },
] as const;

export default function PricingPage() {
  return (
    <>
      <PageHero
        layout="center"
        eyebrow="Pricing"
        title="Pricing isn’t set yet."
        lead="We would rather tell you that than invent numbers for a product that is still being built. Here is how plans may differ, and what will not depend on your plan."
        status={<StatusPill status="planned" label="Pre-launch · no prices" />}
      />

      <Section tone="light" aria-labelledby="shapes-title" className="py-20 sm:py-28">
        <Container>
          <SectionHeading
            id="shapes-title"
            eyebrow="Plan shapes"
            title="Three possible ways to size it."
            lead="These names are working labels. Nothing here is final, and no plan is available."
          />
          <RevealStagger
            as="ol"
            stagger={0.1}
            className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border"
          >
            {SHAPES.map((s, i) => (
              <li key={s.name} data-reveal-item="" className="md:px-8 md:first:pl-0 md:last:pr-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-xs text-primary-text">0{i + 1}</p>
                  <StatusPill status="planned" label="Working name" />
                </div>
                <Heading level={3} size="lg" className="mt-4">
                  {s.name}
                </Heading>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">{s.who}</p>
                <ul className="mt-6 space-y-2.5 border-t border-border pt-5">
                  {s.emphasis.map((e) => (
                    <li key={e} className="flex gap-3 text-sm leading-snug">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary-text"
                      />
                      {e}
                    </li>
                  ))}
                </ul>
                <p className="mt-6 font-display text-2xl font-semibold tracking-tight text-muted-foreground">
                  Price not decided
                </p>
              </li>
            ))}
          </RevealStagger>
        </Container>
      </Section>

      <Section
        tone="dark"
        aria-labelledby="dimensions-title"
        className="border-t border-border py-20 sm:py-28"
      >
        <Container className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeading
              id="dimensions-title"
              eyebrow="What may differ"
              title="Size, not safety."
              lead="If plans differ, it will be by how much you use, not by how safe the rules are."
            />
            <Reveal className="mt-8">
              <Callout tone="info" title="What will not depend on your plan">
                How rules are evaluated, the default of blocking, and the separate records for
                “authorized” and “executed” are the same for everyone.
              </Callout>
            </Reveal>
          </div>
          <Reveal className="lg:col-span-7">
            <MonoLabel>Possible differences, limits not decided</MonoLabel>
            <dl className="mt-4 divide-y divide-border border-y border-border">
              {DIMENSIONS.map((d) => (
                <div
                  key={d.name}
                  className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6"
                >
                  <dt className="text-base font-medium">{d.name}</dt>
                  <dd className="text-base text-muted-foreground">{d.note}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </Container>
      </Section>

      <Section tone="light" aria-labelledby="faq-title" className="py-20 sm:py-28">
        <Container className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <SectionHeading id="faq-title" eyebrow="Questions" title="Pricing, honestly." />
          </div>
          <Reveal className="lg:col-span-8">
            <ul className="divide-y divide-border border-y border-border">
              {FAQ.map((f) => (
                <li key={f.q}>
                  <details className="group/faq">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                      {f.q}
                      <ChevronRight
                        aria-hidden="true"
                        className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-standard group-open/faq:rotate-90"
                      />
                    </summary>
                    <p className="pb-6 text-base leading-relaxed text-muted-foreground">{f.a}</p>
                  </details>
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </Section>

      <PageCta
        title="Help us price it fairly."
        text="Tell us how many agents you run and what you would need to approve. It is the most useful input we can get right now."
        primary={{ href: "/contact", label: "Tell us about your use" }}
        secondary={{ href: "/dashboard", label: "Explore the demo" }}
      />
    </>
  );
}
