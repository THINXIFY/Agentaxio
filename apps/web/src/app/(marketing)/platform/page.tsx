import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { ApprovalPanel, AuditPanel, IdentityPanel } from "@/components/marketing/feature-panels";
import { PageCta, SectionHeading, Window } from "@/components/marketing/site/blocks";
import { Callout } from "@/components/marketing/site/callout";
import {
  AuthorizationFlow,
  PolicyPrecedence,
  RevocationTimeline,
} from "@/components/marketing/site/diagrams";
import { FeatureRow } from "@/components/marketing/site/feature-row";
import { PageHero } from "@/components/marketing/site/page-hero";
import { StatusPill } from "@/components/marketing/site/status-pill";
import { RevealStagger } from "@/components/motion/reveal";
import { ScrollLine } from "@/components/motion/scroll-line";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Platform",
  description:
    "How AgentAxio manages AI agent identities, permissions, human approvals, activity and access revocation for actions routed through it.",
};

const STEPS = [
  {
    title: "Register an agent",
    text: "Give each agent its own identity and a scoped credential for each environment.",
  },
  {
    title: "Set permissions",
    text: "Write a rule for each action. Anything without a rule is blocked.",
  },
  {
    title: "Request and decide",
    text: "The agent proposes an action. AgentAxio answers: allowed, needs approval, or blocked.",
  },
  {
    title: "Act and record",
    text: "Only allowed or approved actions run, once, through the trusted executor. The history keeps both facts.",
  },
] as const;

export default function PlatformPage() {
  return (
    <>
      <PageHero
        eyebrow="The platform"
        title="One checkpoint between your agents and the tools they use."
        lead="AgentAxio manages who an agent is, what it may do, when a person has to approve, and what happened afterwards. It does this for the actions you route through it."
        status={
          <>
            <StatusPill status="demo" />
            <StatusPill status="designed" label="Enforcement backend: designed, not built" />
          </>
        }
        actions={
          <>
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/dashboard">
                Explore the demo dashboard <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href="/developers">Developer overview</Link>
            </Button>
          </>
        }
        aside={
          <Window title="Path of one request" status={<StatusPill status="designed" />}>
            <AuthorizationFlow />
          </Window>
        }
      />

      <FeatureRow
        id="identities"
        tone="light"
        variant="plain"
        n="01"
        eyebrow="Agent identities"
        title="Every agent is someone specific."
        text="Each agent has its own identity and credential per environment. AgentAxio works out who is asking from the credential, never from what the request claims."
        points={[
          "One credential per agent and environment",
          "Only a short preview is ever shown; the full secret is shown once",
          "Rotate or revoke one agent without touching the rest",
        ]}
        status={<StatusPill status="demo" />}
        visual={<IdentityPanel />}
      />

      <FeatureRow
        id="permissions"
        tone="dark"
        variant="plain"
        flip
        n="02"
        eyebrow="Permissions"
        title="Rules decide. Predictably."
        text="Permissions are fixed rules, not a model’s opinion. The same request always gets the same answer, and when no rule matches, the answer is blocked."
        points={[
          "Three answers: allowed, needs approval, blocked",
          "A “blocked” rule always beats the others",
          "No AI model makes the decision",
        ]}
        status={<StatusPill status="designed" />}
        visual={<PolicyPrecedence />}
      />

      <FeatureRow
        id="approvals"
        tone="light"
        variant="plain"
        n="03"
        eyebrow="Human approvals"
        title="A person sees exactly what will happen."
        text="When a rule asks for approval, a reviewer sees the exact values. They can’t edit them in place: a change is a new request that needs a new approval."
        points={[
          "Reviewers see the real values, not a summary",
          "Requesters can’t approve their own requests",
          "Approval is permission, not proof that it ran",
        ]}
        status={<StatusPill status="demo" />}
        visual={<ApprovalPanel />}
      />

      <FeatureRow
        id="activity"
        tone="dark"
        variant="plain"
        flip
        n="04"
        eyebrow="Activity"
        title="Two facts, kept apart."
        text="Every request leaves a trail. “Authorized” and “executed” are separate records, so the history never claims more than actually happened."
        points={[
          "Who asked, what for, and how it was answered",
          "Who approved, and when",
          "What ran, and whether it worked",
        ]}
        status={<StatusPill status="demo" />}
        visual={<AuditPanel />}
      />

      <FeatureRow
        id="revocation"
        tone="light"
        variant="plain"
        n="05"
        eyebrow="Access revocation"
        title="Switch an agent off, and it stays off."
        text="Suspending an agent blocks its next request. Anything approved earlier is re-checked just before it runs, so an old approval can’t outlive the agent’s access."
        points={[
          "Takes effect at every AgentAxio-controlled enforcement point",
          "Re-checked at the moment of execution",
          "Recorded in the activity history",
        ]}
        status={<StatusPill status="designed" />}
        visual={<RevocationTimeline />}
      />

      <Section
        tone="dark"
        aria-labelledby="workflow-title"
        className="border-t border-border py-20 sm:py-28"
      >
        <Container>
          <SectionHeading
            id="workflow-title"
            eyebrow="A simple authorization workflow"
            title="Four steps from a new agent to a recorded action."
          />
          <ScrollLine className="mt-12 h-px bg-border-strong" />
          <RevealStagger
            as="ol"
            stagger={0.1}
            className="mt-10 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4"
          >
            {STEPS.map((s, i) => (
              <li key={s.title} data-reveal-item="" className="relative">
                <p className="font-mono text-xs text-primary-text">0{i + 1}</p>
                <h3 className="mt-3 text-xl font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </RevealStagger>
        </Container>
      </Section>

      <Section tone="light" aria-labelledby="scope-title" className="py-16 sm:py-20">
        <Container className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeading
              id="scope-title"
              eyebrow="Scope"
              title="What AgentAxio controls, and what it doesn’t."
            />
          </div>
          <div className="space-y-5 lg:col-span-7">
            <p className="text-lg leading-relaxed text-muted-foreground">
              AgentAxio controls the actions that go <em>through</em> it. It does not discover or
              control agents on its own.
            </p>
            <Callout tone="scope" title="Direct credentials can bypass it">
              A workflow or administrator that still holds direct credentials to a tool can act
              without AgentAxio. That is why the design moves tool credentials to the trusted
              executor.
            </Callout>
            <Callout tone="info" title="Where this stands">
              The demo dashboard and this website exist today, on sample data. The enforcement
              backend, accounts, credentials and integrations are designed but not built. See the{" "}
              <Link
                href="/security"
                className="font-medium text-primary-text underline underline-offset-4"
              >
                Security page
              </Link>{" "}
              for the full split.
            </Callout>
          </div>
        </Container>
      </Section>

      <PageCta
        title="See it working on sample data."
        text="Open the demo dashboard and follow a request from proposal to outcome. No sign-up, no real data."
        primary={{ href: "/dashboard", label: "Explore the demo dashboard" }}
        secondary={{ href: "/security", label: "Read the security approach" }}
      />
    </>
  );
}
