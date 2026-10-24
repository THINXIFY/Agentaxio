import { ActivityItem } from "@/components/dashboard/activity-item";
import { AgentList } from "@/components/dashboard/agent-list";
import { RequestsChart } from "@/components/dashboard/charts";
import { PendingItem } from "@/components/dashboard/approval-card";
import { HelpTip } from "@/components/dashboard/help-tip";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Panel } from "@/components/dashboard/panel";
import { DemoBadge } from "@/components/feedback/demo-notice";
import { PageHeader } from "@/components/layout/page-header";
import { GLOSSARY } from "@/lib/plain-language";
import {
  decisionBreakdown,
  listDashboardAgents,
  listDashboardRequests,
  MOCK_WINDOW_LABEL,
  outcomesByDay,
  pendingApprovals,
  sampleTrends,
} from "@/mocks/dashboard";

const AGENTS_SHOWN = 5;
const PENDING_SHOWN = 3;
const ACTIVITY_SHOWN = 5;

export function DemoOverviewPage() {
  const agents = listDashboardAgents();
  const requests = listDashboardRequests();
  const pending = pendingApprovals();
  const blocked = decisionBreakdown(requests).denied;
  const connected = agents.filter((a) => a.status === "active").length;
  const trends = sampleTrends({ agents: connected, pending: pending.length, blocked });

  return (
    <>
      <PageHeader
        title="Overview"
        description="See your agents, what needs your attention, and what they have been up to."
        actions={<DemoBadge />}
      />

      <section aria-label="Summary" className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <MetricCard
          title="Connected Agents"
          value={connected}
          helper={`of ${agents.length} agents are active`}
          href="/dashboard/agents"
          linkLabel="see all agents"
          trend={trends.agents}
        />
        <MetricCard
          title="Pending Approvals"
          value={pending.length}
          helper={pending.length === 1 ? "request needs a decision" : "requests need a decision"}
          href="/dashboard/approvals"
          linkLabel="review pending approvals"
          tone={pending.length > 0 ? "attention" : "neutral"}
          trend={trends.pending}
        />
        <MetricCard
          title="Blocked Actions"
          value={blocked}
          helper="stopped by your rules"
          href="/dashboard/audit"
          linkLabel="see recent activity"
          tone={blocked > 0 ? "blocked" : "neutral"}
          trend={trends.blocked}
        />
      </section>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          id="requests-chart"
          title="Recent requests"
          description={`What your agents asked to do, and how each request was answered (${MOCK_WINDOW_LABEL}).`}
          className="xl:col-span-12"
        >
          <RequestsChart
            data={outcomesByDay(requests)}
            caption={`Requests per day, ${MOCK_WINDOW_LABEL}, split into allowed, needs approval and blocked. Sample data.`}
          />
        </Panel>

        <Panel
          id="my-agents"
          title="My Agents"
          description="The agents you have set up, and what each one is for."
          action={{ href: "/dashboard/agents", label: `See all ${agents.length}` }}
          flush
          className="xl:col-span-7"
        >
          <AgentList agents={agents.slice(0, AGENTS_SHOWN)} />
        </Panel>

        <Panel
          id="pending-approvals"
          title="Pending Approvals"
          description="Agents waiting for a person to say yes or no."
          action={{ href: "/dashboard/approvals", label: "See all" }}
          aside={<HelpTip term="Approval">{GLOSSARY.approval}</HelpTip>}
          flush
          className="xl:col-span-5"
        >
          <ul>
            {pending.slice(0, PENDING_SHOWN).map((r) => (
              <PendingItem key={r.id} request={r} />
            ))}
          </ul>
        </Panel>

        <Panel
          id="recent-activity"
          title="Recent Activity"
          description="The latest things your agents asked to do, and what happened."
          action={{ href: "/dashboard/audit", label: "See all activity" }}
          flush
          className="xl:col-span-12"
        >
          <ul>
            {requests.slice(0, ACTIVITY_SHOWN).map((r) => (
              <ActivityItem key={r.id} request={r} />
            ))}
          </ul>
        </Panel>
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        Sample data as of 20 Oct 2026, 10:00 UTC. Nothing here is live, and no permission is
        enforced.
      </p>
    </>
  );
}
