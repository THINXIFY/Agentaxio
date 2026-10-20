import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import {
  ApprovalPanel,
  AuditPanel,
  IdentityPanel,
  RuleScan,
} from "@/components/marketing/feature-panels";
import { IntegrationFlow } from "@/components/marketing/integration-flow";
import { PageCta, SectionHeading } from "@/components/marketing/site/blocks";
import { FeatureRow } from "@/components/marketing/site/feature-row";
import { PageHero } from "@/components/marketing/site/page-hero";
import { AgentsPanel } from "@/components/marketing/site/solution-visuals";
import { StatusPill } from "@/components/marketing/site/status-pill";
import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Agent management, identity and access, permission policies, human approvals, activity and audit logs, and the n8n integration.",
};

const JUMP = [
  { id: "agent-management", label: "Agent Management" },
  { id: "identity-access", label: "Identity & Access" },
  { id: "permission-policies", label: "Permission Policies" },
  { id: "human-approvals", label: "Human Approvals" },
  { id: "activity-audit", label: "Activity & Audit" },
  { id: "n8n-integration", label: "n8n Integration" },
] as const;

const LATER = [
  "TypeScript SDK, after the n8n demo is proven end to end",
  "Policy version history with safe rollbacks",
  "Finer-grained resource scopes and approval chains",
  "Usage analytics and billing",
  "MCP tool gateways and further integrations",
] as const;

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        layout="center"
        eyebrow="Features"
        title="Six things, done carefully."
        lead="Everything AgentAxio does is about one moment: an agent wants to act. Here is how each part helps you stay in control of it."
        status={
          <>
            <StatusPill status="demo" />
            <StatusPill status="designed" label="Backend: designed, not built" />
          </>
        }
      />

      <nav
        aria-label="On this page"
        className="surface-dark sticky top-(--topbar-height) z-(--z-sticky) border-b border-border bg-background/90 backdrop-blur-xl"
      >
        <Container>
          <ul className="-mx-1 flex gap-1 overflow-x-auto py-2.5 text-sm">
            {JUMP.map((j, i) => (
              <li key={j.id} className="shrink-0">
                <a
                  href={`#${j.id}`}
                  className="inline-flex items-center gap-2 rounded-control px-3 py-1.5 whitespace-nowrap text-muted-foreground transition-colors duration-200 hover:bg-surface hover:text-foreground"
                >
                  <span className="font-mono text-xs text-primary-text" aria-hidden="true">
                    0{i + 1}
                  </span>
                  {j.label}
                </a>
              </li>
            ))}
          </ul>
        </Container>
      </nav>

      <FeatureRow
        id="agent-management"
        tone="light"
        eyebrow="01 · Agent Management"
        title="Know every agent, and who owns it."
        text="Keep an inventory of the agents you run, with an owner and an environment for each. Switch one off without touching the others."
        points={[
          "Each agent has an owner and a clear active or suspended state",
          "Separate environments, such as dev and staging",
          "Suspending an agent blocks its next request",
        ]}
        visualTitle="My Agents"
        status={<StatusPill status="demo" />}
        visual={<AgentsPanel />}
      />

      <FeatureRow
        id="identity-access"
        tone="dark"
        flip
        eyebrow="02 · Identity & Access"
        title="Who is asking comes from the credential."
        text="Every agent gets its own scoped credential per environment. The request can’t claim to be someone else, because identity is never read from the request."
        points={[
          "One credential per agent and environment",
          "Stored hashed and shown once, never kept in the browser",
          "Rotate or revoke one agent without disturbing the rest",
        ]}
        visualTitle="Agent identities"
        status={<StatusPill status="demo" />}
        visual={<IdentityPanel />}
      />

      <FeatureRow
        id="permission-policies"
        tone="light"
        eyebrow="03 · Permission Policies"
        title="Rules that give the same answer every time."
        text="Write a rule for each action: allow it, ask a person first, or block it. Rules are checked in a fixed order, and if nothing matches, the answer is blocked."
        points={[
          "Allowed, needs approval, or blocked, never “maybe”",
          "A blocked rule always wins; the default is blocked",
          "No AI model decides who gets access",
        ]}
        visualTitle="Checking a request against the rules"
        status={<StatusPill status="designed" />}
        visual={<RuleScan />}
      />

      <FeatureRow
        id="human-approvals"
        tone="dark"
        flip
        eyebrow="04 · Human Approvals"
        title="A person reviews the real values."
        text="When a rule asks for approval, an authorized reviewer sees exactly what the agent wants to do. They can’t edit it in place, and they can’t approve their own request."
        points={[
          "Reviewers see the exact values",
          "A change means a new request and a new approval",
          "Approval is permission, not proof that it ran",
        ]}
        visualTitle="A request awaiting review"
        status={<StatusPill status="demo" />}
        visual={<ApprovalPanel />}
      />

      <FeatureRow
        id="activity-audit"
        tone="light"
        eyebrow="05 · Activity & Audit Logs"
        title="A history that never overstates."
        text="Each request leaves a record of who asked, how it was answered, who approved and what ran. “Authorized” and “executed” are separate facts."
        points={[
          "Who asked, what for, and the decision",
          "Who approved, and when",
          "What actually ran, and whether it succeeded",
        ]}
        visualTitle="Activity history"
        status={<StatusPill status="demo" />}
        visual={<AuditPanel />}
      />

      <FeatureRow
        id="n8n-integration"
        tone="dark"
        flip
        eyebrow="06 · n8n Integration"
        title="Start where agencies already work."
        text="n8n comes first. A workflow proposes an action with n8n’s built-in HTTP Request node, then checks the status. It holds only its AgentAxio credential, never the tool’s."
        points={[
          "No custom node or SDK to start",
          "Safe retries with an idempotency key",
          "If AgentAxio can’t be reached, the action does not run",
        ]}
        visualTitle="Proposed contract · V1 design"
        status={<StatusPill status="proposed" />}
        visual={<IntegrationFlow />}
      />

      <Section
        tone="light"
        aria-labelledby="later-title"
        className="border-t border-border py-16 sm:py-24"
      >
        <Container className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeading
              id="later-title"
              eyebrow="After the first release"
              title="What we are deliberately not promising yet."
            />
          </div>
          <Reveal className="lg:col-span-7">
            <ul className="divide-y divide-border border-y border-border">
              {LATER.map((item) => (
                <li key={item} className="flex items-center justify-between gap-4 py-4">
                  <span className="text-base">{item}</span>
                  <StatusPill status="planned" className="shrink-0" />
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-muted-foreground">
              Looking for how this works in detail? Read the{" "}
              <Link
                href="/security"
                className="font-medium text-primary-text underline underline-offset-4"
              >
                security approach
              </Link>{" "}
              or the{" "}
              <Link
                href="/developers"
                className="font-medium text-primary-text underline underline-offset-4"
              >
                developer overview
              </Link>
              .
            </p>
          </Reveal>
        </Container>
      </Section>

      <PageCta
        title="Try it on sample data."
        text="The demo dashboard shows every feature above with invented data. Nothing in it is connected to a real agent."
        primary={{ href: "/dashboard", label: "Explore the demo dashboard" }}
        secondary={{ href: "/platform", label: "How the platform works" }}
      />
    </>
  );
}
