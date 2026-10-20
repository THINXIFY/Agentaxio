import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { MonoLabel, PageCta, SectionHeading } from "@/components/marketing/site/blocks";
import { Callout } from "@/components/marketing/site/callout";
import { PageHero } from "@/components/marketing/site/page-hero";
import { StatusPill, type Availability } from "@/components/marketing/site/status-pill";
import { Reveal, RevealStagger } from "@/components/motion/reveal";
import { ScrollLine } from "@/components/motion/scroll-line";
import { Heading } from "@/components/ui/typography";

export const metadata: Metadata = {
  title: "About",
  description:
    "AgentAxio’s mission, the principles behind it, and an honest account of where the product stands.",
};

const PRINCIPLES = [
  {
    title: "Control should be predictable.",
    text: "The same request gets the same answer. Rules decide, not a model’s mood, and when nothing says yes, the answer is no.",
  },
  {
    title: "A person should see what will really happen.",
    text: "Approval means looking at the exact values, not a summary. If a value changes, it is a new decision.",
  },
  {
    title: "Records must not overstate.",
    text: "“Approved” and “done” are different facts. The history keeps them apart so it never claims more than it knows.",
  },
  {
    title: "Say what is built, and what isn’t.",
    text: "Sample data is labelled. Planned features are marked planned. We would rather under-promise than be caught over-claiming.",
  },
] as const;

const ROADMAP: ReadonlyArray<{ title: string; text: string; status: Availability; label: string }> =
  [
    {
      title: "Foundation and interface",
      text: "Requirements, architecture, threat model, this website and the demo dashboard.",
      status: "built",
      label: "Done, on sample data",
    },
    {
      title: "Accounts and agents",
      text: "Secure sign-in, organizations, roles, and an agent registry with credentials.",
      status: "planned",
      label: "Planned",
    },
    {
      title: "Authorization",
      text: "The rule engine, action requests, and single-use grants, with the security tests that prove them.",
      status: "planned",
      label: "Planned",
    },
    {
      title: "Approvals and activity",
      text: "The approval queue, expiry, execution records and the audit history.",
      status: "planned",
      label: "Planned",
    },
    {
      title: "n8n integration",
      text: "The first guarded workflow, end to end, then a TypeScript SDK.",
      status: "planned",
      label: "Planned · first integration",
    },
    {
      title: "Hardening and private beta",
      text: "Threat review, backups, monitoring, security review and a small group of pilot users.",
      status: "planned",
      label: "Planned",
    },
  ];

export default function AboutPage() {
  return (
    <>
      <PageHero
        layout="wide"
        eyebrow="About"
        title="We’re building the control layer for what AI agents do."
        lead="AI agents can now take real actions in the tools people use. AgentAxio exists so that a person stays in charge of those actions, with clear rules, a say before it matters, and an honest record afterwards."
        status={<StatusPill status="planned" label="Pre-release" />}
      />

      <Section tone="light" aria-labelledby="why-title" className="py-20 sm:py-28">
        <Container className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeading
              id="why-title"
              eyebrow="Why it exists"
              title="Permissions end up scattered."
            />
          </div>
          <Reveal className="space-y-5 lg:col-span-7">
            <p className="font-display text-2xl leading-snug font-medium tracking-tight text-balance sm:text-3xl">
              Every team that gives an agent a tool ends up building its own permissions, its own
              approvals and its own log, in several places.
            </p>
            <p className="text-lg leading-relaxed text-muted-foreground">
              AgentAxio brings those into one place for the actions you route through it: who the
              agent is, what it may do, when a person has to approve, and what happened. It starts
              with n8n workflows, where many agents already act.
            </p>
          </Reveal>
        </Container>
      </Section>

      <Section
        tone="dark"
        aria-labelledby="principles-title"
        className="border-t border-border py-20 sm:py-28"
      >
        <Container>
          <SectionHeading
            id="principles-title"
            eyebrow="Principles"
            title="Four things we hold to."
          />
          <ScrollLine className="mt-12 h-px bg-border-strong" />
          <RevealStagger
            as="ol"
            stagger={0.1}
            className="mt-10 grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2"
          >
            {PRINCIPLES.map((p, i) => (
              <li key={p.title} data-reveal-item="" className="flex gap-5">
                <span aria-hidden="true" className="font-mono text-xs text-primary-text">
                  0{i + 1}
                </span>
                <div>
                  <Heading level={3} size="lg">
                    {p.title}
                  </Heading>
                  <p className="mt-2 text-base leading-relaxed text-muted-foreground">{p.text}</p>
                </div>
              </li>
            ))}
          </RevealStagger>
        </Container>
      </Section>

      <Section tone="light" aria-labelledby="vision-title" className="py-20 sm:py-28">
        <Container className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <SectionHeading
              id="vision-title"
              eyebrow="Product vision"
              title="Where this is headed."
              lead="The order of work. It is a plan, not a promise of dates."
            />
          </div>
          <Reveal className="lg:col-span-8">
            <ol className="divide-y divide-border border-y border-border">
              {ROADMAP.map((r) => (
                <li
                  key={r.title}
                  className="grid grid-cols-1 gap-x-6 gap-y-2 py-5 sm:grid-cols-[1fr_auto] sm:items-start"
                >
                  <div>
                    <p className="text-base font-medium">{r.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{r.text}</p>
                  </div>
                  <StatusPill status={r.status} label={r.label} className="w-fit" />
                </li>
              ))}
            </ol>
          </Reveal>
        </Container>
      </Section>

      <Section
        tone="dark"
        aria-labelledby="honest-title"
        className="border-t border-border py-20 sm:py-28"
      >
        <Container className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeading
              id="honest-title"
              eyebrow="What you won’t find here"
              title="No borrowed credibility."
            />
          </div>
          <Reveal className="space-y-6 lg:col-span-7">
            <p data-not-claimed="" className="text-lg leading-relaxed text-muted-foreground">
              There are no customer logos, testimonials, usage numbers or partner badges on this
              site, because there are no customers yet. When there are, they will be real, and they
              will have agreed to be named.
            </p>
            <div>
              <MonoLabel>Team and company details</MonoLabel>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                Information about the people and the company behind AgentAxio will be added once the
                founders have approved what to publish.
              </p>
            </div>
            <Callout tone="review" title="Needs founder input before launch">
              Company name and registration, team members, and any funding or history are
              intentionally left out of this page until they are confirmed.
            </Callout>
          </Reveal>
        </Container>
      </Section>

      <PageCta
        title="Want to shape what gets built first?"
        text="We are speaking with people who run AI agents and n8n workflows. A short note about what you do helps more than you’d think."
        primary={{ href: "/contact", label: "Get in touch" }}
        secondary={{ href: "/platform", label: "How the platform works" }}
      />
    </>
  );
}
