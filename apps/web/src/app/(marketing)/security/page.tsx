import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Ban, FileWarning } from "lucide-react";
import {
  ArchitectureDiagram,
  CredentialCustody,
  EnforcementPoints,
} from "@/components/marketing/art/architecture";
import {
  ArtHero,
  Chapter,
  Prose,
  StatusMark,
  StatusStrip,
  type StatusKind,
} from "@/components/marketing/art/chapter";
import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = {
  title: "Security",
  description:
    "AgentAxio's intended security architecture: three zones, six enforcement points, where each secret lives, and exactly what is built, designed and planned. No certifications are claimed.",
};

const LEDGER: ReadonlyArray<{ status: StatusKind; title: string; note: string }> = [
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
    note: "Only a short credential preview is shown. Nothing sensitive is stored client-side.",
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

const COLUMNS: ReadonlyArray<{ status: StatusKind; heading: string; lead: string }> = [
  { status: "built", heading: "Built", lead: "Exists today, on sample data" },
  { status: "designed", heading: "Designed", lead: "Specified, not built" },
  { status: "planned", heading: "Planned", lead: "On the roadmap, ahead of launch" },
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
      <ArtHero
        label="Security"
        title="No single part can decide, hold the keys, and act."
        lead="AgentAxio is designed so that an agent never decides what it may do. This page shows where the boundaries are, where each secret lives, and which of it is designed rather than built."
      >
        <StatusStrip kinds={["designed", "planned"]}>
          The architecture below is the intended design. It is not built or running, and no
          independent review has been done.
        </StatusStrip>
        <ArchitectureDiagram className="mt-10" />
      </ArtHero>

      <Chapter
        id="enforcement"
        index="01"
        label="Enforcement points"
        round
        wide
        title="Six boundaries, and what is enforced at each."
        lead="Wherever one zone meets another, something is checked. These are the numbered points in the schematic."
      >
        <Reveal>
          <EnforcementPoints />
        </Reveal>
      </Chapter>

      <Chapter
        id="credentials"
        index="02"
        label="Credentials"
        wide
        title="Each secret lives in exactly one place."
        lead="The agent never holds the tool’s credentials, the workflow never sees the grant, and the browser holds no long-lived secret."
      >
        <Reveal>
          <CredentialCustody />
        </Reveal>
      </Chapter>

      <Chapter
        id="failure"
        index="03"
        label="Failure and audit"
        tone="dark"
        title="When something fails, nothing runs. What happened is written down."
      >
        <Reveal className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-0 md:divide-x md:divide-border">
          <div className="md:pr-10">
            <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
              Rules and failure
            </p>
            <Prose className="mt-4 text-base">
              <p>
                Rules are deterministic and the default is blocked. The same request always gets the
                same answer, and no AI model takes part.
              </p>
              <p>
                If AgentAxio or its database can’t be reached, or anything errors, protected actions
                are denied. There is no implicit approval.
              </p>
            </Prose>
          </div>
          <div className="md:pl-10">
            <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
              The record
            </p>
            <Prose className="mt-4 text-base">
              <p>
                Authorization and execution are separate entries, so “approved” never reads as
                “done”. Each names the requester, the action, the policy version, the decision and
                the approver.
              </p>
              <p>
                Written append-only by a restricted writer, with the tamper-evidence strategy still
                to be chosen. Secrets, raw authorization headers and sensitive values are never
                logged.
              </p>
            </Prose>
          </div>
        </Reveal>
      </Chapter>

      <Chapter
        id="status"
        index="04"
        label="What exists today"
        wide
        title="Built, designed, planned. Kept apart."
        lead="We separate what you can use now from what is specified and what is still ahead."
      >
        <Reveal className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border-strong/50">
          {COLUMNS.map((c) => (
            <div key={c.status} className="md:px-7 md:first:pl-0 md:last:pr-0">
              <StatusMark status={c.status} className="text-sm text-foreground">
                {c.heading}
              </StatusMark>
              <p className="mt-1.5 text-sm text-muted-foreground">{c.lead}</p>
              <ul className="mt-5 space-y-5 border-t border-border-strong/50 pt-5">
                {LEDGER.filter((l) => l.status === c.status).map((l) => (
                  <li key={l.title}>
                    <p className="text-[0.9375rem] leading-snug font-medium">{l.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{l.note}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Reveal>
        <p
          data-not-claimed=""
          className="mt-10 border-t border-border-strong/50 pt-5 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase"
        >
          Certifications: none claimed
        </p>
      </Chapter>

      <Chapter
        id="threats"
        index="05"
        label="Threats"
        tone="dark"
        wide
        title="Eight things that go wrong, and the intended answer."
        lead="Each one will need an automated test before the related feature is allowed to ship."
      >
        <Reveal>
          <div className="hidden grid-cols-[1fr_1.2fr] gap-8 border-b border-border pb-3 md:grid">
            <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
              Threat
            </p>
            <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
              Intended design
            </p>
          </div>
          <ul className="divide-y divide-border">
            {THREATS.map((t) => (
              <li
                key={t.threat}
                className="grid grid-cols-1 gap-1 py-4 md:grid-cols-[1fr_1.2fr] md:gap-8"
              >
                <p className="text-base font-medium">{t.threat}</p>
                <p className="text-base leading-relaxed text-muted-foreground">{t.design}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </Chapter>

      <Chapter
        id="gates"
        index="06"
        label="Before launch"
        wide
        title="Three gates, none yet reached."
        lead="Visual polish does not substitute for security tests. Each gate has to pass before the next kind of use is allowed."
      >
        <Reveal>
          <ol className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border-strong/50">
            {GATES.map((g) => (
              <li key={g.n} className="md:px-7 md:first:pl-0 md:last:pr-0">
                <p className="font-mono text-xs text-primary-text">{g.n}</p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight">{g.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground">{g.text}</p>
                <StatusMark status="planned" className="mt-4 text-muted-foreground">
                  Not yet reached
                </StatusMark>
              </li>
            ))}
          </ol>
        </Reveal>
      </Chapter>

      <Chapter
        id="limits"
        index="07"
        label="What we do not claim"
        tone="dark"
        title="Plainly, so you don’t have to ask."
      >
        <Reveal className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
          <ul data-not-claimed="" className="space-y-4">
            {NOT_CLAIMED.map((x) => (
              <li key={x} className="flex gap-3 text-lg leading-snug">
                <Ban className="mt-1.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {x}
              </li>
            ))}
          </ul>
          <div className="space-y-5">
            <div className="border-l-2 border-warning-border pl-5">
              <p className="flex items-center gap-2 text-base font-semibold text-warning-text">
                <FileWarning className="size-4" aria-hidden="true" />
                Reporting a vulnerability
              </p>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                A security contact address and a disclosure process will be published before any
                private beta. Until then there is no live product to report against. This needs to
                be set up by the founders before launch.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              This page describes intent and the current state, not a guarantee. It will change as
              parts are built and reviewed.
            </p>
            <Link
              href="/developers"
              className="group inline-flex items-center gap-2 text-base font-medium text-primary-text underline-offset-4 hover:underline"
            >
              Read the proposed developer contract
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-200 ease-standard group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </Reveal>
      </Chapter>
    </>
  );
}
