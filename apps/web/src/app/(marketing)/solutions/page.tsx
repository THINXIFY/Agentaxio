import type { Metadata } from "next";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { ApprovalPanel, AuditPanel } from "@/components/marketing/feature-panels";
import { MonoLabel, PageCta, SectionHeading, Window } from "@/components/marketing/site/blocks";
import { PageHero } from "@/components/marketing/site/page-hero";
import { ClientLanes, SdkSketch } from "@/components/marketing/site/solution-visuals";
import { StatusPill } from "@/components/marketing/site/status-pill";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "How AI automation agencies, SaaS developers and businesses using AI agents can use AgentAxio, with illustrative examples.",
};

function Persona({
  id,
  tone,
  n,
  eyebrow,
  title,
  lead,
  needs,
  helps,
  example,
  visual,
  flip = false,
}: {
  id: string;
  tone: "light" | "dark";
  n: string;
  eyebrow: string;
  title: string;
  lead: string;
  needs: readonly string[];
  helps: readonly string[];
  example: { title: string; body: string };
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <Section
      id={id}
      tone={tone}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-(--topbar-height) py-20 sm:py-28"
    >
      <Container className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
        <Reveal className={cn("lg:col-span-6", flip && "lg:order-2")}>
          <p aria-hidden="true" className="font-mono text-xs text-primary-text">
            {n}
          </p>
          <Eyebrow className="mt-3">{eyebrow}</Eyebrow>
          <Heading id={`${id}-title`} level={2} size="display-sm" className="mt-4">
            {title}
          </Heading>
          <Text variant="lead" className="mt-4 text-pretty">
            {lead}
          </Text>

          <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
            <div>
              <MonoLabel>What you usually need</MonoLabel>
              <ul className="mt-3 space-y-2.5">
                {needs.map((x) => (
                  <li key={x} className="flex gap-3 text-base leading-snug">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground"
                    />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <MonoLabel>How AgentAxio helps</MonoLabel>
              <ul className="mt-3 space-y-2.5">
                {helps.map((x) => (
                  <li key={x} className="flex gap-3 text-base leading-snug">
                    <Check className="mt-1 size-4 shrink-0 text-primary-text" aria-hidden="true" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>

        <Reveal y={36} delay={0.08} className={cn("space-y-6 lg:col-span-6", flip && "lg:order-1")}>
          {visual}
          <figure className="rounded-card border border-border bg-surface-sunken p-6">
            <figcaption className="flex flex-wrap items-center justify-between gap-2">
              <MonoLabel>Example · {example.title}</MonoLabel>
              <StatusPill status="demo" label="Illustrative scenario" />
            </figcaption>
            <p className="mt-3 text-base leading-relaxed">{example.body}</p>
          </figure>
        </Reveal>
      </Container>
    </Section>
  );
}

const FIT_YES = [
  "You run agents or workflows (n8n first, your own code later) that take actions in other tools",
  "You want a person to approve certain actions, and a clear record of what happened",
  "You can route those actions through a controlled step instead of giving agents direct credentials",
] as const;

const FIT_NOT_YET = [
  "Controlling agents you can’t route through AgentAxio: it does not discover or control them on its own",
  "Payments, refunds or banking actions: out of scope for the first beta",
  "Enterprise single sign-on or SCIM",
  "Anything that needs a certified or independently audited product today",
] as const;

export default function SolutionsPage() {
  return (
    <>
      <PageHero
        layout="wide"
        eyebrow="Solutions"
        title="Built for the people who run agents."
        lead="Three kinds of teams, three practical ways to put a person and a rulebook between an AI agent and the tools it touches. Examples are illustrative scenarios, not customers."
        actions={
          <>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <a href="#agencies">AI automation agencies</a>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <a href="#developers-saas">SaaS developers</a>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <a href="#businesses">Businesses using AI agents</a>
            </Button>
          </>
        }
      />

      <Persona
        id="agencies"
        tone="light"
        n="01"
        eyebrow="AI automation agencies"
        title="Many clients, one clear boundary for each."
        lead="You build workflows for several clients. Each client’s agents need their own limits, and you need to show what an agent did on whose behalf."
        needs={[
          "Separate access for each client’s agents",
          "Client-side sign-off on sensitive actions",
          "A record you can point to when asked",
        ]}
        helps={[
          "One agent identity and credential per client and environment",
          "Rules and approvals per agent",
          "Suspend one client’s agent without touching the others",
        ]}
        example={{
          title: "lead intake for three clients",
          body: "An agency runs a lead-intake workflow for three clients. Each client’s agent has its own credential, so a lead can only be added to that client’s CRM. When an agent proposes a lead from an unfamiliar company, a rule asks the account owner to approve it first, and the history shows which client’s agent asked.",
        }}
        visual={
          <Window title="Per-client agents" status={<StatusPill status="demo" />}>
            <ClientLanes />
          </Window>
        }
      />

      <Persona
        id="developers-saas"
        tone="dark"
        flip
        n="02"
        eyebrow="SaaS developers"
        title="Let your agent act, with a checkpoint you don’t have to build."
        lead="You ship a product with a tool-calling agent. Before it creates or changes anything for a customer, you want a rule or a person to say yes."
        needs={[
          "Permission checks outside your prompt",
          "Approvals without building an inbox",
          "Retries that don’t repeat side effects",
        ]}
        helps={[
          "One request before every sensitive tool call",
          "Rules and approvals handled for you",
          "Idempotency keys make retries safe",
        ]}
        example={{
          title: "a support assistant",
          body: "A product team’s support assistant can create follow-up tasks in their own app. The team routes each “create task” call through AgentAxio: allowed for known customers, held for approval for new ones. The agent never holds the app’s own credentials. A TypeScript SDK is planned; until then, calls would use the HTTP API as proposed on the developers page.",
        }}
        visual={
          <Window
            title="Calling AgentAxio from code"
            status={<StatusPill status="planned" label="SDK planned" />}
          >
            <SdkSketch />
          </Window>
        }
      />

      <Persona
        id="businesses"
        tone="light"
        n="03"
        eyebrow="Businesses using AI agents"
        title="Keep a person in charge, without slowing everything down."
        lead="Your team already uses AI agents to do routine work. You want routine requests to flow, unusual ones to wait for a person, and a plain history of what happened."
        needs={[
          "A short queue of things that need a decision",
          "Routine actions that don’t wait",
          "An easy answer to “what did the agent do?”",
        ]}
        helps={[
          "Allowed, needs approval, or blocked, per rule",
          "Approvers see the exact values and decide",
          "Activity history that separates approved from done",
        ]}
        example={{
          title: "adding leads to a CRM",
          body: "A sales-operations lead lets an agent add leads to the CRM. Companies on the approved list go straight through. Anything unfamiliar waits for a person. Companies on the blocked list are stopped. Afterwards the history shows which was which, and whether the lead was actually created.",
        }}
        visual={
          <div className="grid grid-cols-1 gap-4">
            <Window title="Needs approval" status={<StatusPill status="demo" label="Sample" />}>
              <ApprovalPanel />
            </Window>
            <Window title="Afterwards" status={<StatusPill status="demo" label="Sample" />}>
              <AuditPanel />
            </Window>
          </div>
        }
      />

      <Section
        tone="dark"
        aria-labelledby="fit-title"
        className="border-t border-border py-20 sm:py-28"
      >
        <Container>
          <SectionHeading
            id="fit-title"
            eyebrow="Is it right for you today?"
            title="An honest fit check."
            lead="AgentAxio is pre-release. Here is who it is being designed for first, and what it does not cover."
          />
          <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
            <Reveal className="rounded-card border border-border p-7">
              <MonoLabel>A good fit</MonoLabel>
              <ul className="mt-5 space-y-4">
                {FIT_YES.map((x) => (
                  <li key={x} className="flex gap-3 text-base leading-relaxed">
                    <Check className="mt-1 size-4 shrink-0 text-success-text" aria-hidden="true" />
                    {x}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.08} className="rounded-card border border-border p-7">
              <MonoLabel>Not covered yet</MonoLabel>
              <ul className="mt-5 space-y-4" data-not-claimed="">
                {FIT_NOT_YET.map((x) => (
                  <li key={x} className="flex gap-3 text-base leading-relaxed">
                    <X className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    {x}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
          <p className="mt-8 text-sm text-muted-foreground">
            See what is built and what is planned on the{" "}
            <Link
              href="/security"
              className="font-medium text-primary-text underline underline-offset-4"
            >
              Security page
            </Link>
            .
          </p>
        </Container>
      </Section>

      <PageCta
        title="Tell us what your agents do."
        text="We are talking to agencies and developers who run agents today. Your use case helps decide what gets built first."
        primary={{ href: "/contact", label: "Get in touch" }}
        secondary={{ href: "/dashboard", label: "Explore the demo" }}
      />
    </>
  );
}
