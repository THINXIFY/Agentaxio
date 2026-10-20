import type { Metadata } from "next";
import {
  ArrowLinks,
  ArtHero,
  Chapter,
  StatusMark,
  StatusStrip,
  type StatusKind,
} from "@/components/marketing/art/chapter";
import { Reveal } from "@/components/motion/reveal";
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

const ROADMAP: ReadonlyArray<{ title: string; text: string; status: StatusKind; label: string }> = [
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
      <ArtHero
        label="About"
        title="We’re building the control layer for what AI agents do."
        lead="AI agents can now take real actions in the tools people use. AgentAxio exists so that a person stays in charge of those actions: clear rules, a say before it matters, and an honest record afterwards."
      >
        <StatusStrip kinds={["built", "planned"]}>
          Pre-release. What follows is intent and a plan, not a record of achievements.
        </StatusStrip>
      </ArtHero>

      <Chapter
        id="why"
        index="01"
        label="Why it exists"
        round
        title="Permissions end up scattered."
      >
        <Reveal className="max-w-[60ch] space-y-6">
          <p className="font-display text-[clamp(1.5rem,1.15rem+1.2vw,2.125rem)] leading-snug font-medium tracking-tight text-balance">
            Every team that gives an agent a tool ends up building its own permissions, its own
            approvals and its own log, in several places.
          </p>
          <p className="text-[1.0625rem] leading-relaxed text-muted-foreground">
            AgentAxio brings those into one place for the actions you route through it: who the
            agent is, what it may do, when a person has to approve, and what happened. It starts
            with n8n workflows, where many agents already act.
          </p>
        </Reveal>
      </Chapter>

      <Chapter
        id="principles"
        index="02"
        label="Principles"
        tone="dark"
        wide
        title="Four things we hold to."
      >
        <ScrollLine className="h-px bg-border-strong" />
        <Reveal>
          <ol className="mt-8 grid grid-cols-1 gap-x-14 gap-y-10 md:grid-cols-2">
            {PRINCIPLES.map((p, i) => (
              <li key={p.title} className="flex gap-5">
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
          </ol>
        </Reveal>
      </Chapter>

      <Chapter
        id="vision"
        index="03"
        label="Product vision"
        wide
        title="Where this is headed."
        lead="The order of work. It is a plan, not a promise of dates."
      >
        <Reveal>
          <ol className="border-t border-border">
            {ROADMAP.map((r) => (
              <li
                key={r.title}
                className="grid grid-cols-1 gap-x-8 gap-y-1.5 border-b border-border py-5 md:grid-cols-[minmax(0,17rem)_1fr_12rem] md:items-baseline"
              >
                <p className="text-base font-medium">{r.title}</p>
                <p className="text-base leading-relaxed text-muted-foreground">{r.text}</p>
                <StatusMark status={r.status} className="md:justify-end">
                  {r.label}
                </StatusMark>
              </li>
            ))}
          </ol>
        </Reveal>
      </Chapter>

      <Chapter
        id="honest"
        index="04"
        label="No borrowed credibility"
        tone="dark"
        title="What you won’t find here."
      >
        <Reveal className="max-w-[62ch] space-y-8">
          <p data-not-claimed="" className="text-[1.0625rem] leading-relaxed text-muted-foreground">
            There are no customer logos, testimonials, usage numbers or partner badges on this site,
            because there are no customers yet. When there are, they will be real, and they will
            have agreed to be named.
          </p>
          <div>
            <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
              Team and company details
            </p>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Information about the people and the company behind AgentAxio will be added once the
              founders have approved what to publish.
            </p>
          </div>
          <p className="border-l-2 border-warning-border pl-5 text-base leading-relaxed">
            <strong className="font-semibold text-warning-text">
              Needs founder input before launch.
            </strong>{" "}
            <span className="text-muted-foreground">
              Company name and registration, team members, and any funding or history are
              intentionally left out of this page until they are confirmed.
            </span>
          </p>
        </Reveal>
        <ArrowLinks
          className="mt-12 border-t border-border pt-6"
          links={[
            { href: "/platform", label: "How the platform works" },
            { href: "/contact", label: "Help shape what gets built first" },
          ]}
        />
      </Chapter>
    </>
  );
}
