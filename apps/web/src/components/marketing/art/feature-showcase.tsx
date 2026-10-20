"use client";

import * as React from "react";
import * as RadixTabs from "@radix-ui/react-tabs";
import { Check } from "lucide-react";
import { ActivityItem } from "@/components/dashboard/activity-item";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { AgentIdentityCard } from "@/components/dashboard/agent-identity-card";
import { ApprovalCard } from "@/components/dashboard/approval-card";
import { FeaturedIntegration, integrationGroups } from "@/components/dashboard/integration-status";
import { Panel } from "@/components/dashboard/panel";
import { PermissionSummary } from "@/components/dashboard/permission-summary";
import { PlainAgentStatusBadge } from "@/components/dashboard/plain-status";
import { ProductFrame } from "@/components/marketing/art/product-frame";
import { cn } from "@/lib/cn";
import { listDashboardAgents, listDashboardRequests, pendingApprovals } from "@/mocks/dashboard";

/**
 * Six controls, shown as the product itself. One frame, six states: choosing a control swaps the demonstration for the
 * real dashboard components that control uses (the same panels, badges, cards and rows as the demo dashboard), on the
 * dashboard's own surfaces, with invented data. Everything is a conceptual demo; nothing is connected.
 */

const agents = listDashboardAgents();
const requests = listDashboardRequests();

function AgentsDemo() {
  return (
    <Panel
      id="demo-agents"
      title="My Agents"
      description="The agents you have set up, and what each one is for."
      flush
    >
      <ul>
        {agents.slice(0, 5).map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/50 px-4 py-4 first:border-t-0 sm:px-6"
          >
            <AgentAvatar name={a.name} className="size-10 text-xs" />
            <div className="min-w-0 flex-1 basis-40">
              <h3 className="text-base font-medium">{a.name}</h3>
              <p className="text-sm leading-snug text-muted-foreground">{a.description}</p>
            </div>
            <span className="ml-14 sm:ml-0">
              <PlainAgentStatusBadge status={a.status} />
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function IdentityDemo() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <AgentIdentityCard agent={agents[0]!} headingLevel={3} />
      <AgentIdentityCard agent={agents[1]!} headingLevel={3} />
    </div>
  );
}

function PermissionsDemo() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {agents.slice(0, 2).map((a) => (
        <Panel key={a.id} id={`demo-perm-${a.id}`} title={a.name} description="What it can do">
          <PermissionSummary permissions={a.permissions} />
        </Panel>
      ))}
    </div>
  );
}

function ApprovalsDemo() {
  return <ApprovalCard request={pendingApprovals()[0]!} headingLevel={3} />;
}

function ActivityDemo() {
  return (
    <Panel
      id="demo-activity"
      title="Activity"
      description="Newest first. Open an item for the precise record."
      flush
    >
      <ul>
        {requests.slice(0, 3).map((r) => (
          <ActivityItem key={r.id} request={r} details />
        ))}
      </ul>
    </Panel>
  );
}

function IntegrationDemo() {
  return <FeaturedIntegration integration={integrationGroups().featured} />;
}

const FEATURES = [
  {
    id: "agent-management",
    title: "Agent management",
    summary: "Know every agent, who owns it, and whether it is switched on.",
    frame: "My Agents",
    points: [
      "An inventory of agents, each with an owner and an environment such as dev or staging",
      "A clear active or suspended state, and suspending one agent leaves the rest alone",
      "A suspended agent’s next request is blocked",
    ],
    Demo: AgentsDemo,
  },
  {
    id: "identity-access",
    title: "Identity and access",
    summary: "Who is asking comes from the credential, never from the request.",
    frame: "Agent identities",
    points: [
      "One scoped credential per agent and environment",
      "Stored hashed and shown once. The dashboard only ever shows a short preview",
      "Rotate or revoke one agent without disturbing the others",
    ],
    Demo: IdentityDemo,
  },
  {
    id: "permission-policies",
    title: "Permission policies",
    summary: "Rules that give the same answer every time, and block by default.",
    frame: "Permissions",
    points: [
      "Each rule is allowed, needs approval, or blocked. Never “maybe”",
      "A blocked rule beats the others, and anything unmatched is blocked",
      "No AI model takes part in the decision",
    ],
    Demo: PermissionsDemo,
  },
  {
    id: "human-approvals",
    title: "Human approvals",
    summary: "A person reviews the exact values, then decides.",
    frame: "Approvals",
    points: [
      "Reviewers see the real values, and cannot edit them in place",
      "A changed value is a new request and needs a new approval",
      "Approval is permission, not proof that the action ran",
    ],
    Demo: ApprovalsDemo,
  },
  {
    id: "activity-audit",
    title: "Activity and audit logs",
    summary: "A history that keeps “approved” and “done” apart.",
    frame: "Activity",
    points: [
      "Who asked, what for, and how it was answered",
      "Who approved, and when",
      "What actually ran, and whether it worked. Authorization and execution are separate records",
    ],
    Demo: ActivityDemo,
  },
  {
    id: "n8n-integration",
    title: "n8n integration",
    summary: "The first enforcement point, using n8n’s own HTTP Request node.",
    frame: "Integrations",
    points: [
      "A workflow proposes an action and checks its status. No custom node needed to start",
      "The workflow holds only its AgentAxio credential, never the tool’s",
      "Planned, not available: nothing is connected in the pre-release",
    ],
    Demo: IntegrationDemo,
  },
] as const;

export function FeatureShowcase() {
  const [active, setActive] = React.useState<string>(FEATURES[0].id);
  const current = FEATURES.find((f) => f.id === active) ?? FEATURES[0];
  const Demo = current.Demo;

  return (
    <RadixTabs.Root
      value={active}
      onValueChange={setActive}
      orientation="vertical"
      className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12"
    >
      <RadixTabs.List
        aria-label="Controls"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:col-span-4 lg:mx-0 lg:block lg:overflow-visible lg:px-0 lg:pb-0"
      >
        {FEATURES.map((f, i) => (
          <RadixTabs.Trigger
            key={f.id}
            value={f.id}
            className={cn(
              "group/tab relative shrink-0 rounded-md px-3 py-2.5 text-left transition-colors duration-200 ease-standard lg:block lg:w-full lg:rounded-none lg:border-t lg:border-border lg:px-0 lg:py-4",
              "text-muted-foreground hover:text-foreground data-[state=active]:text-foreground",
              "max-lg:data-[state=active]:bg-surface",
              "before:absolute before:top-0 before:left-0 before:hidden before:h-px before:w-full before:origin-left before:scale-x-0 before:bg-primary before:transition-transform before:duration-300 before:ease-emphasized lg:before:block lg:data-[state=active]:before:scale-x-100",
            )}
          >
            <span className="flex items-baseline gap-3 whitespace-nowrap lg:whitespace-normal">
              <span className="font-mono text-xs text-primary-text">0{i + 1}</span>
              <span className="text-base font-medium lg:text-lg">{f.title}</span>
            </span>
            <span className="mt-1.5 hidden pl-[1.625rem] text-sm leading-snug text-muted-foreground lg:block">
              {f.summary}
            </span>
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>

      <div className="min-w-0 lg:col-span-8">
        <ProductFrame title={current.frame} bodyClassName="min-h-[26rem] lg:min-h-[31rem]">
          <RadixTabs.Content
            key={current.id}
            value={current.id}
            className="ax-tab-in outline-none focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Demo />
          </RadixTabs.Content>
        </ProductFrame>

        <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-4 border-t border-border pt-6 md:grid-cols-[minmax(0,14rem)_1fr]">
          <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
            {current.title}
            <span className="mt-1 block text-sm tracking-normal text-foreground normal-case lg:hidden">
              {current.summary}
            </span>
          </p>
          <ul className="space-y-3">
            {current.points.map((p) => (
              <li key={p} className="flex gap-3 text-base leading-relaxed">
                <Check className="mt-1.5 size-4 shrink-0 text-primary-text" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </RadixTabs.Root>
  );
}
