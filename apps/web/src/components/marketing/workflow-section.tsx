import * as React from "react";
import { ActionRequestStatusBadge } from "@/components/domain/status-badge";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { AuditPanel } from "@/components/marketing/feature-panels";
import { Reveal, RevealStagger } from "@/components/motion/reveal";
import { ScrollLine } from "@/components/motion/scroll-line";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";
import { HOME_SECTION_IDS } from "@/config/navigation";

function KeyValue({ rows }: { rows: ReadonlyArray<readonly [string, React.ReactNode]> }) {
  return (
    <dl
      aria-hidden="true"
      className="divide-y divide-border border-y border-border font-mono text-xs"
    >
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 py-2.5">
          <dt className="shrink-0 whitespace-nowrap text-muted-foreground">{k}</dt>
          <dd className="truncate text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const STAGES: ReadonlyArray<{
  n: string;
  verb: string;
  title: string;
  body: string;
  visual: React.ReactNode;
}> = [
  {
    n: "01",
    verb: "Register",
    title: "Register an agent.",
    body: "Name it, assign an owner and an environment, and issue a scoped credential. The secret is shown once and stored hashed.",
    visual: (
      <KeyValue
        rows={[
          ["agent", "Lead Intake Agent"],
          ["environment", "dev"],
          ["owner", "Demo Admin"],
          ["credential", "agx_dev_7Hk2…"],
        ]}
      />
    ),
  },
  {
    n: "02",
    verb: "Enforce",
    title: "Define and enforce permissions.",
    body: "Policies are deterministic and default-deny. Every proposed action is checked against them, and a deny rule always wins.",
    visual: (
      <div
        aria-hidden="true"
        className="flex flex-col items-start gap-2.5 border-y border-border py-4"
      >
        <ActionRequestStatusBadge status="denied" />
        <ActionRequestStatusBadge status="pending_approval" />
        <ActionRequestStatusBadge status="queued_execution" />
      </div>
    ),
  },
  {
    n: "03",
    verb: "Approve",
    title: "Request approval when required.",
    body: "Sensitive actions wait for an authorized reviewer who sees the exact parameters. Requesters can’t approve themselves, and approvals expire.",
    visual: (
      <KeyValue
        rows={[
          ["requested by", "lead-intake (agent)"],
          ["reviewed by", "demo approver"],
          ["window", "expires in 15 min"],
          ["self-approval", "rejected"],
        ]}
      />
    ),
  },
  {
    n: "04",
    verb: "Execute",
    title: "Execute, then record the outcome.",
    body: "A trusted executor consumes a single-use grant and acts. Authorization and execution are written as separate events.",
    visual: <AuditPanel />,
  },
];

export function WorkflowSection() {
  return (
    <Section id={HOME_SECTION_IDS.workflow} tone="dark" aria-labelledby="workflow-title">
      <Container>
        <Reveal className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <Eyebrow>How it works</Eyebrow>
            <Heading id="workflow-title" level={2} size="display-md" className="mt-5">
              Register. Enforce. Approve. Execute.
            </Heading>
          </div>
          <Text variant="lead" className="lg:col-span-5 lg:pb-2">
            The workflow asks and waits. It never receives a token it could replay, and it never
            holds the downstream tool’s credentials.
          </Text>
        </Reveal>

        <div className="relative mt-16">
          {/* Connector drawn on scroll (desktop) */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 hidden h-px bg-border xl:block"
          />
          <ScrollLine className="absolute inset-x-0 top-0 hidden h-px bg-primary xl:block" />

          <RevealStagger
            as="ol"
            y={40}
            stagger={0.12}
            className="grid grid-cols-1 gap-14 pt-2 sm:grid-cols-2 xl:grid-cols-4 xl:gap-0 xl:pt-0"
          >
            {STAGES.map((s) => (
              <li
                key={s.n}
                data-reveal-item=""
                className="relative flex min-w-0 flex-col xl:border-l xl:border-border xl:px-8 xl:pt-10 xl:first:border-l-0 xl:first:pl-0 xl:last:pr-0"
              >
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-0 hidden size-[0.4rem] -translate-y-1/2 rounded-full bg-primary xl:block"
                />
                <p
                  aria-hidden="true"
                  data-text={s.n}
                  className="deco-text text-outline font-display text-[5.5rem] leading-none font-semibold tracking-tighter"
                />
                <p className="mt-6 font-mono text-xs tracking-[0.14em] text-primary-text uppercase">
                  {s.verb}
                </p>
                <h3 className="mt-3 font-display text-2xl leading-tight font-semibold tracking-tight">
                  {s.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">{s.body}</p>
                <div className="mt-8 flex flex-1 flex-col justify-end">{s.visual}</div>
              </li>
            ))}
          </RevealStagger>
        </div>
      </Container>
    </Section>
  );
}
