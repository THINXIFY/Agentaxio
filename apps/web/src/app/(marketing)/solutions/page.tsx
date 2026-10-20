import type { Metadata } from "next";
import { Check, X } from "lucide-react";
import { ActivityItem } from "@/components/dashboard/activity-item";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { ApprovalCard } from "@/components/dashboard/approval-card";
import { Panel } from "@/components/dashboard/panel";
import { PlainAgentStatusBadge } from "@/components/dashboard/plain-status";
import { ArrowLinks, ArtHero, Chapter, StatusStrip } from "@/components/marketing/art/chapter";
import { CodeBlock } from "@/components/marketing/art/code-block";
import { ProductFrame } from "@/components/marketing/art/product-frame";
import { Reveal } from "@/components/motion/reveal";
import { listDashboardAgents, listDashboardRequests, pendingApprovals } from "@/mocks/dashboard";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "How AI automation agencies, SaaS developers and businesses using AI agents can use AgentAxio, with illustrative scenarios shown in demo UI.",
};

const agents = listDashboardAgents();

const SDK_SKETCH = `// Illustrative sketch of a planned SDK.
// Nothing is published and the shape may change.
const result = await agentaxio.actions.request({
  action: "crm.lead.create",
  resource: "mockcrm/leads",
  parameters: { full_name, email, company },
  idempotencyKey,
});

if (result.status !== "succeeded") {
  // pending_approval, denied, failed, expired ...
}`;

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

function Bullets({
  heading,
  items,
  check = false,
}: {
  heading: string;
  items: readonly string[];
  check?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
        {heading}
      </p>
      <ul className="mt-3 space-y-2.5">
        {items.map((x) => (
          <li key={x} className="flex gap-3 text-base leading-snug">
            {check ? (
              <Check className="mt-1 size-4 shrink-0 text-primary-text" aria-hidden="true" />
            ) : (
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground"
              />
            )}
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Scenario({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-border-strong pl-5">
      <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
        Illustrative scenario · {title}
      </p>
      <p className="mt-2 text-base leading-relaxed">{children}</p>
    </div>
  );
}

const CLIENT_ROWS = [
  { client: "Client A", agent: agents[0]!, note: "Adds leads to Client A’s CRM only" },
  { client: "Client B", agent: agents[1]!, note: "Adds leads to Client B’s CRM only" },
  { client: "Client C", agent: agents[2]!, note: "Suspended: every request is blocked" },
] as const;

export default function SolutionsPage() {
  return (
    <>
      <ArtHero
        label="Solutions"
        title="Three ways to put a rulebook between an agent and its tools."
        lead="Agencies, product teams and businesses use agents differently, and need different things from a control layer. Each scenario below is illustrative, not a customer, and is shown in the demo UI."
      >
        <StatusStrip kinds={["demo", "planned"]}>
          Scenarios are invented, and every screen is a conceptual demo. Nothing is connected, and
          the SDK shown for developers does not exist.
        </StatusStrip>
      </ArtHero>

      <Chapter
        id="agencies"
        index="01"
        label="Agencies"
        round
        title="Many clients, one clear boundary for each."
        lead="You build workflows for several clients. Each client’s agents need their own limits, and you need to show what an agent did on whose behalf."
      >
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-10 lg:gap-12">
          <Reveal className="space-y-8 lg:col-span-4">
            <Bullets
              heading="What you usually need"
              items={[
                "Separate access for each client’s agents",
                "Client-side sign-off on sensitive actions",
                "A record you can point to when asked",
              ]}
            />
            <Bullets
              heading="How AgentAxio helps"
              check
              items={[
                "One agent identity and credential per client and environment",
                "Rules and approvals per agent",
                "Suspend one client’s agent without touching the others",
              ]}
            />
            <Scenario title="lead intake for three clients">
              A lead can only be added to that client’s CRM, because each agent has its own
              credential. A lead from an unfamiliar company waits for the account owner’s approval,
              and the history shows which client’s agent asked.
            </Scenario>
          </Reveal>
          <Reveal y={32} delay={0.08} className="lg:col-span-6">
            <ProductFrame title="My Agents">
              <Panel
                id="clients"
                title="Agents by client"
                description="Invented clients and agents."
                flush
              >
                <ul>
                  {CLIENT_ROWS.map((r) => (
                    <li
                      key={r.client}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/50 px-4 py-4 first:border-t-0 sm:px-6"
                    >
                      <AgentAvatar name={r.agent.name} className="size-10 text-xs" />
                      <div className="min-w-0 flex-1 basis-44">
                        <h3 className="text-base font-medium">
                          {r.client}{" "}
                          <span className="font-normal text-muted-foreground">
                            · {r.agent.name}
                          </span>
                        </h3>
                        <p className="text-sm leading-snug text-muted-foreground">{r.note}</p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {r.agent.credentialPrefix} · {r.agent.environment}
                        </p>
                      </div>
                      <PlainAgentStatusBadge status={r.agent.status} />
                    </li>
                  ))}
                </ul>
              </Panel>
            </ProductFrame>
          </Reveal>
        </div>
      </Chapter>

      <Chapter
        id="developers-saas"
        index="02"
        label="SaaS developers"
        tone="dark"
        title="A checkpoint you don’t have to build."
        lead="You ship a product with a tool-calling agent. Before it creates or changes anything for a customer, you want a rule or a person to say yes."
      >
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-10 lg:gap-12">
          <Reveal y={32} className="lg:col-span-6">
            <CodeBlock
              label="Illustrative SDK sketch"
              json={SDK_SKETCH}
              plain
              note="A planned SDK, sketched. Not published, and the shape may change."
            />
          </Reveal>
          <Reveal delay={0.08} className="space-y-8 lg:col-span-4">
            <Bullets
              heading="What you usually need"
              items={[
                "Permission checks outside your prompt",
                "Approvals without building an inbox",
                "Retries that don’t repeat side effects",
              ]}
            />
            <Bullets
              heading="How AgentAxio helps"
              check
              items={[
                "One request before every sensitive tool call",
                "Rules and approvals handled for you",
                "Idempotency keys make retries safe",
              ]}
            />
            <Scenario title="a support assistant">
              The assistant can create follow-up tasks in the team’s own app. Calls for known
              customers are allowed, calls for new ones wait for approval, and the agent never holds
              the app’s credentials. Until an SDK exists, calls would use the proposed HTTP API.
            </Scenario>
          </Reveal>
        </div>
      </Chapter>

      <Chapter
        id="businesses"
        index="03"
        label="Businesses"
        wide
        title="Keep a person in charge, without slowing everything down."
        lead="Your team already uses AI agents for routine work. Routine requests should flow, unusual ones should wait for a person, and there should be a plain history of what happened."
      >
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-2 xl:gap-8">
          <Reveal y={32}>
            <ProductFrame title="Approvals">
              <ApprovalCard request={pendingApprovals()[0]!} headingLevel={3} />
            </ProductFrame>
          </Reveal>
          <Reveal y={32} delay={0.08}>
            <ProductFrame title="Activity">
              <Panel
                id="afterwards"
                title="Afterwards"
                description="What happened to recent requests."
                flush
              >
                <ul>
                  {listDashboardRequests()
                    .filter(
                      (r) =>
                        r.status === "succeeded" ||
                        r.status === "denied" ||
                        r.status === "approved",
                    )
                    .slice(0, 3)
                    .map((r) => (
                      <ActivityItem key={r.id} request={r} details />
                    ))}
                </ul>
              </Panel>
            </ProductFrame>
          </Reveal>
        </div>
        <Reveal className="mt-12 grid grid-cols-1 gap-10 border-t border-border pt-8 md:grid-cols-3">
          <Bullets
            heading="What you usually need"
            items={[
              "A short queue of things that need a decision",
              "Routine actions that don’t wait",
              "An easy answer to “what did the agent do?”",
            ]}
          />
          <Bullets
            heading="How AgentAxio helps"
            check
            items={[
              "Allowed, needs approval, or blocked, per rule",
              "Approvers see the exact values and decide",
              "A history that separates approved from done",
            ]}
          />
          <Scenario title="adding leads to a CRM">
            Companies on the approved list go straight through, anything unfamiliar waits for a
            person, and companies on the blocked list are stopped. Afterwards the history shows
            which was which, and whether the lead was actually created.
          </Scenario>
        </Reveal>
      </Chapter>

      <Chapter
        id="fit"
        index="04"
        label="Fit check"
        tone="dark"
        title="An honest fit check."
        lead="AgentAxio is pre-release. Here is who it is being designed for first, and what it does not cover."
      >
        <Reveal className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-0 md:divide-x md:divide-border">
          <div className="md:pr-10">
            <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
              A good fit
            </p>
            <ul className="mt-4 space-y-4">
              {FIT_YES.map((x) => (
                <li key={x} className="flex gap-3 text-base leading-relaxed">
                  <Check className="mt-1 size-4 shrink-0 text-success-text" aria-hidden="true" />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="md:pl-10">
            <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
              Not covered yet
            </p>
            <ul data-not-claimed="" className="mt-4 space-y-4">
              {FIT_NOT_YET.map((x) => (
                <li key={x} className="flex gap-3 text-base leading-relaxed">
                  <X className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <ArrowLinks
          className="mt-12 border-t border-border pt-6"
          links={[
            { href: "/security", label: "What is built and what is planned" },
            { href: "/contact", label: "Tell us what your agents do" },
            { href: "/dashboard", label: "Explore the demo" },
          ]}
        />
      </Chapter>
    </>
  );
}
