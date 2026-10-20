import * as React from "react";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import {
  ApprovalPanel,
  AuditPanel,
  GrantPanel,
  IdentityPanel,
  RuleScan,
} from "@/components/marketing/feature-panels";
import { Parallax } from "@/components/motion/parallax";
import { Reveal, RevealStagger } from "@/components/motion/reveal";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";
import { HOME_SECTION_IDS } from "@/config/navigation";
import { cn } from "@/lib/cn";

function Cell({
  n,
  title,
  body,
  className,
  wide = false,
  children,
}: {
  n: string;
  title: string;
  body: string;
  className?: string;
  /** Full-width cell: copy on the left, visual on the right. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article
      data-reveal-item=""
      className={cn(
        "flex min-w-0 flex-col bg-background p-7 sm:p-9",
        wide && "lg:grid lg:grid-cols-2 lg:items-center lg:gap-16",
        className,
      )}
    >
      <div>
        <p className="font-mono text-xs text-primary-text">{n}</p>
        <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
          {title}
        </h3>
        <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <div className={cn("mt-8", wide && "lg:mt-0")}>{children}</div>
    </article>
  );
}

export function FeaturesSection() {
  return (
    <Section id={HOME_SECTION_IDS.features} tone="dark" aria-labelledby="features-title">
      <Parallax
        distance={140}
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 right-0 -z-10"
      >
        <div className="size-[520px] rounded-full bg-primary/[0.06] blur-[130px]" />
      </Parallax>

      <Container>
        <Reveal className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <Eyebrow>Built for the moment an agent acts</Eyebrow>
            <Heading id="features-title" level={2} size="display-md" className="mt-5">
              Controls that hold up when the agent doesn’t.
            </Heading>
          </div>
          <Text variant="lead" className="lg:col-span-5 lg:pb-2">
            Agent text is untrusted input. Every decision comes from deterministic rules and is
            recorded, not left to another model.
          </Text>
        </Reveal>

        {/* Blueprint mosaic: hairline-divided cells of different sizes, not a grid of identical cards. */}
        <RevealStagger
          y={32}
          stagger={0.1}
          className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border bg-border lg:grid-cols-12"
        >
          <Cell
            n="01 / Policy"
            title="Deterministic, default-deny rules"
            body="Rules match on action, agent and environment. Anything missing, malformed or conflicting is denied, and the same input always gives the same answer."
            className="bg-surface lg:col-span-7"
          >
            <RuleScan />
          </Cell>
          <Cell
            n="02 / Identity"
            title="One credential per agent and environment"
            body="Revoke an agent without touching the others."
            className="lg:col-span-5"
          >
            <IdentityPanel />
          </Cell>
          <Cell
            n="03 / Approval"
            title="Review the exact values"
            body="Approvers see precise parameters and can’t edit them in place."
            className="lg:col-span-5"
          >
            <ApprovalPanel />
          </Cell>
          <Cell
            n="04 / Grants"
            title="Single-use, bound to the payload"
            body="Execution is tied to the approved values and consumed once. Grants never leave AgentAxio."
            className="lg:col-span-7"
          >
            <GrantPanel />
          </Cell>
          <Cell
            n="05 / Audit"
            title="Authorized and executed are different facts"
            body="Each is its own record, so the trail never overstates what happened."
            className="lg:col-span-12"
            wide
          >
            <AuditPanel />
          </Cell>
        </RevealStagger>

        <p className="mt-8 max-w-2xl text-sm text-muted-foreground">
          Panels use sample values and describe the Phase 1 design. The enforcement backend is still
          under development.
        </p>
      </Container>
    </Section>
  );
}
