import type { Metadata } from "next";
import { Ban, Check } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { AuditPanel } from "@/components/marketing/feature-panels";
import { MonoLabel, PageCta, SectionHeading, Window } from "@/components/marketing/site/blocks";
import { Callout } from "@/components/marketing/site/callout";
import { PolicyPrecedence, TrustBoundary } from "@/components/marketing/site/diagrams";
import { PageHero } from "@/components/marketing/site/page-hero";
import { StatusPill, type Availability } from "@/components/marketing/site/status-pill";
import { Reveal, RevealStagger } from "@/components/motion/reveal";
import { Heading, Text } from "@/components/ui/typography";

export const metadata: Metadata = {
  title: "Security",
  description:
    "AgentAxio’s intended security architecture: default-deny, scoped credentials, human approval, single-use grants and an audit trail. What is built, what is designed, and what we do not claim.",
};

const STATUS_ROWS: ReadonlyArray<{ status: Availability; title: string; note: string }> = [
  {
    status: "built",
    title: "Website and demo dashboard",
    note: "Run on invented sample data. No real agents, accounts or secrets are involved.",
  },
  {
    status: "built",
    title: "A demo that never implies enforcement",
    note: "Sample data is labelled, and Approve and Reject are switched off.",
  },
  {
    status: "built",
    title: "No secrets in the browser",
    note: "Only a short credential preview is shown, and nothing sensitive is stored client-side.",
  },
  {
    status: "built",
    title: "Accessible, contrast-tested interface",
    note: "Automated accessibility and colour-contrast tests run on every change.",
  },
  {
    status: "designed",
    title: "Deterministic, default-deny rule evaluation",
    note: "Specified. The enforcement backend does not exist yet.",
  },
  {
    status: "designed",
    title: "Scoped agent credentials, stored hashed",
    note: "Identity is derived from the credential, never from the request.",
  },
  {
    status: "designed",
    title: "Human approval with no self-approval",
    note: "Approvers see the exact values and cannot edit them in place.",
  },
  {
    status: "designed",
    title: "Single-use grants and a trusted executor",
    note: "Grants are bound to the exact values, short-lived and consumed once.",
  },
  {
    status: "designed",
    title: "Fail closed",
    note: "If AgentAxio or the database can’t be reached, protected actions do not run.",
  },
  {
    status: "designed",
    title: "Append-only activity history",
    note: "Authorization and execution are recorded as separate facts.",
  },
  {
    status: "planned",
    title: "Rate limits, secret scanning, monitoring, backups",
    note: "Required before any external private beta.",
  },
  {
    status: "planned",
    title: "Independent security assessment",
    note: "Required before use with sensitive data or production credentials.",
  },
];

const THREATS: ReadonlyArray<{ threat: string; design: string }> = [
  {
    threat: "A stolen or impersonated agent credential",
    design: "Scoped, hashed credentials; rotation and revocation; short-lived grants",
  },
  {
    threat: "One customer reaching another’s data",
    design: "Tenant derived on the server and enforced on every query",
  },
  {
    threat: "Changing the values after approval",
    design: "Grants bound to an exact digest of the approved values",
  },
  {
    threat: "Replaying an old approval or grant",
    design: "Single-use grants consumed atomically, with a short lifetime",
  },
  {
    threat: "Approving your own request",
    design: "Separate requester and approver roles; no self-approval by default",
  },
  {
    threat: "An approval that outlives the agent’s access",
    design: "Agent, credential and policy version re-checked at execution",
  },
  {
    threat: "A failure that lets actions through",
    design: "Protected actions are denied on any timeout or error",
  },
  {
    threat: "Instructions hidden in agent text",
    design: "Agent text is untrusted; rules and schemas decide, not a model",
  },
];

const GATES = [
  {
    n: "Gate 1",
    title: "Local prototype",
    text: "Tests for rules, tenant isolation, expiry, replay and failing closed.",
  },
  {
    n: "Gate 2",
    title: "External private beta",
    text: "Integration tests, authentication review, dependency checks, secret scanning, alerting, backups and monitoring.",
  },
  {
    n: "Gate 3",
    title: "Sensitive production",
    text: "Independent architecture and penetration assessment, fixes, recovery exercises, and legal and privacy review.",
  },
] as const;

const NOT_CLAIMED = [
  "No certifications or compliance approvals",
  "No independent security audit or penetration test has been done",
  "Not ready for production use or sensitive data",
  "Does not control agents or tools that are not routed through it",
  "Cannot stop someone who still holds direct credentials to a tool",
] as const;

export default function SecurityPage() {
  return (
    <>
      <PageHero
        eyebrow="Security"
        title="Designed to keep an agent’s power small."
        lead="Default-deny rules, scoped credentials, approvals by people, single-use grants and an honest audit trail. Most of this is designed and not yet built, and this page says which."
        status={
          <>
            <StatusPill status="designed" label="Architecture: designed" />
            <StatusPill status="planned" label="Independent review: planned" />
          </>
        }
        aside={
          <Window title="At a glance" status={<StatusPill status="draft" label="Pre-release" />}>
            <dl className="divide-y divide-border">
              <div className="flex items-start justify-between gap-4 pb-4">
                <dt className="text-sm font-medium">Interface and demo</dt>
                <dd>
                  <StatusPill status="built" />
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 py-4">
                <dt className="text-sm font-medium">Enforcement backend</dt>
                <dd>
                  <StatusPill status="designed" />
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 py-4">
                <dt className="text-sm font-medium">Independent security assessment</dt>
                <dd>
                  <StatusPill status="planned" />
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 pt-4" data-not-claimed="">
                <dt className="text-sm font-medium">Certifications</dt>
                <dd className="text-sm text-muted-foreground">None claimed</dd>
              </div>
            </dl>
          </Window>
        }
      />

      <Section tone="light" aria-labelledby="status-title" className="py-20 sm:py-28">
        <Container className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <SectionHeading
              id="status-title"
              eyebrow="What exists today"
              title="Built, designed, planned."
              lead="We separate what you can use now from what is specified and what is still ahead."
            />
          </div>
          <Reveal className="lg:col-span-8">
            <ul className="divide-y divide-border border-y border-border">
              {STATUS_ROWS.map((r) => (
                <li
                  key={r.title}
                  className="grid grid-cols-1 gap-x-6 gap-y-2 py-5 sm:grid-cols-[1fr_auto] sm:items-start"
                >
                  <div>
                    <p className="text-base font-medium">{r.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{r.note}</p>
                  </div>
                  <StatusPill status={r.status} className="w-fit sm:mt-0.5" />
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </Section>

      <Section
        tone="dark"
        aria-labelledby="boundaries-title"
        className="border-t border-border py-20 sm:py-28"
      >
        <Container>
          <SectionHeading
            id="boundaries-title"
            eyebrow="Architecture"
            title="Three zones, and who is trusted with what."
            lead="An agent proposes. AgentAxio decides and records. A separate trusted executor holds the tool’s credentials and acts. No single part can do all three."
          />
          <Reveal y={32} className="mt-12">
            <TrustBoundary />
          </Reveal>
          <div className="mt-8">
            <Callout tone="scope" title="The limit of this design">
              Only actions routed through AgentAxio are controlled. If a workflow or administrator
              still holds direct credentials to a tool, they can act without it.
            </Callout>
          </div>
        </Container>
      </Section>

      <Section tone="light" aria-labelledby="deny-title" className="py-20 sm:py-28">
        <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <SectionHeading
              id="deny-title"
              eyebrow="Default deny"
              title="If no rule says yes, the answer is no."
              lead="Rules are checked in a fixed order and always give the same answer to the same request. No AI model is involved in the decision."
            />
          </Reveal>
          <Reveal y={32} delay={0.08} className="lg:col-span-7">
            <Window title="Which rule wins" status={<StatusPill status="designed" />}>
              <PolicyPrecedence />
            </Window>
          </Reveal>
        </Container>
      </Section>

      <Section
        tone="dark"
        aria-labelledby="credentials-title"
        className="border-t border-border py-20 sm:py-28"
      >
        <Container>
          <SectionHeading
            id="credentials-title"
            eyebrow="Credential handling"
            title="Each secret lives in exactly one place."
          />
          <RevealStagger
            stagger={0.1}
            className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border"
          >
            {[
              {
                title: "Agent credentials",
                points: [
                  "One per agent and environment",
                  "Stored hashed, shown once at creation",
                  "Rotate or revoke at any time",
                ],
              },
              {
                title: "The tool’s credentials",
                points: [
                  "Held only by the trusted executor",
                  "Never placed in an agent or workflow",
                  "Never sent to the browser",
                ],
              },
              {
                title: "People",
                points: [
                  "Established sign-in and session handling, not home-grown",
                  "Role checks on the server; labels in the interface confer nothing",
                  "Approvers are separate from requesters",
                ],
              },
            ].map((c) => (
              <div key={c.title} data-reveal-item="" className="md:px-8 md:first:pl-0 md:last:pr-0">
                <Heading level={3} size="md">
                  {c.title}
                </Heading>
                <ul className="mt-4 space-y-3">
                  {c.points.map((p) => (
                    <li key={p} className="flex gap-3 text-base leading-snug text-muted-foreground">
                      <Check
                        className="mt-1 size-4 shrink-0 text-primary-text"
                        aria-hidden="true"
                      />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </RevealStagger>
        </Container>
      </Section>

      <Section tone="light" aria-labelledby="audit-title" className="py-20 sm:py-28">
        <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal y={32} className="lg:order-2 lg:col-span-6">
            <Window title="Activity history" status={<StatusPill status="demo" />}>
              <AuditPanel />
            </Window>
          </Reveal>
          <Reveal className="lg:col-span-6">
            <SectionHeading
              id="audit-title"
              eyebrow="Audit design"
              title="A record that is honest about what happened."
            />
            <ul className="mt-8 space-y-4">
              {[
                "Authorization and execution are separate entries, so “approved” never reads as “done”",
                "Each record names the requester, the action, the policy version, the decision and the approver",
                "Written append-only by a restricted writer, with a tamper-evidence strategy still to be chosen",
                "Never logs secrets, raw authorization headers or sensitive values",
              ].map((p) => (
                <li key={p} className="flex gap-3 text-base leading-relaxed">
                  <Check className="mt-1.5 size-4 shrink-0 text-primary-text" aria-hidden="true" />
                  {p}
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </Section>

      <Section
        tone="dark"
        aria-labelledby="threats-title"
        className="border-t border-border py-20 sm:py-28"
      >
        <Container>
          <SectionHeading
            id="threats-title"
            eyebrow="Threats we design against"
            title="Eight things that go wrong, and the intended answer."
            lead="Each one will need an automated test before the related feature is allowed to ship."
          />
          <Reveal y={28} className="mt-12">
            <div className="hidden grid-cols-[1fr_1.2fr] gap-8 border-b border-border pb-3 md:grid">
              <MonoLabel>Threat</MonoLabel>
              <MonoLabel>Intended design</MonoLabel>
            </div>
            <ul className="divide-y divide-border">
              {THREATS.map((t) => (
                <li
                  key={t.threat}
                  className="grid grid-cols-1 gap-1.5 py-5 md:grid-cols-[1fr_1.2fr] md:gap-8"
                >
                  <p className="text-base font-medium">{t.threat}</p>
                  <p className="text-base leading-relaxed text-muted-foreground">{t.design}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </Section>

      <Section tone="light" aria-labelledby="gates-title" className="py-20 sm:py-28">
        <Container>
          <SectionHeading
            id="gates-title"
            eyebrow="Before launch"
            title="Three gates, none yet reached."
            lead="Visual polish does not substitute for security tests. Each gate has to pass before the next kind of use is allowed."
          />
          <RevealStagger
            as="ol"
            stagger={0.1}
            className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3"
          >
            {GATES.map((g) => (
              <li key={g.n} data-reveal-item="" className="border-t-2 border-border-strong pt-5">
                <p className="font-mono text-xs text-primary-text">{g.n}</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">{g.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground">{g.text}</p>
                <StatusPill status="planned" label="Not yet reached" className="mt-4" />
              </li>
            ))}
          </RevealStagger>
        </Container>
      </Section>

      <Section
        tone="dark"
        aria-labelledby="claims-title"
        className="border-t border-border py-20 sm:py-28"
      >
        <Container className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeading
              id="claims-title"
              eyebrow="What we do not claim"
              title="Plainly, so you don’t have to ask."
            />
          </div>
          <Reveal className="space-y-8 lg:col-span-7">
            <ul className="space-y-4" data-not-claimed="">
              {NOT_CLAIMED.map((x) => (
                <li key={x} className="flex gap-3 text-lg leading-snug">
                  <Ban
                    className="mt-1.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {x}
                </li>
              ))}
            </ul>
            <Callout tone="review" title="Reporting a vulnerability">
              A security contact address and a disclosure process will be published before any
              private beta. Until then there is no live product to report against. This needs to be
              set up by the founders before launch.
            </Callout>
            <Text variant="muted">
              This page describes intent and the current state, not a guarantee. It will change as
              parts are built and reviewed.
            </Text>
          </Reveal>
        </Container>
      </Section>

      <PageCta
        title="Questions about the approach?"
        text="Read the developer overview for the proposed API, or tell us what you would need to see before trusting a control layer."
        primary={{ href: "/developers", label: "Developer overview" }}
        secondary={{ href: "/contact", label: "Get in touch" }}
      />
    </>
  );
}
