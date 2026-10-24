import { Bot } from "lucide-react";
import Link from "next/link";
import { RequestsChart } from "@/components/dashboard/charts";
import { HelpTip } from "@/components/dashboard/help-tip";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Panel } from "@/components/dashboard/panel";
import { LiveAgentList, LiveRequestItem } from "@/components/live/records";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/misc";
import { relativeTime, actionVerb } from "@/lib/api/present";
import { loadOverview, type LiveSession } from "@/lib/api/server";
import { GLOSSARY } from "@/lib/plain-language";
import type { DayOutcomes } from "@/mocks/dashboard";
import { gate, LoadFailed } from "./gate";
import { getAgents, getApprovals, getRequests } from "./data";

const dayLabel = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

export async function LiveOverviewPage({ session }: { session: LiveSession }) {
  const g = gate(session, "Overview");
  if (!("ready" in g)) return g.node;
  const { org } = g.ready;
  const [overview, agents, pending, requests] = await Promise.all([
    loadOverview(org.base),
    getAgents(org.base),
    getApprovals(org.base, "pending", 3),
    getRequests(org.base, 5),
  ]);
  if (!overview.ok) return <LoadFailed what="The overview" />;
  const o = overview.data;
  const days: DayOutcomes[] = o.daily.map((d) => ({
    date: d.day,
    label: dayLabel.format(new Date(`${d.day}T00:00:00Z`)),
    blocked: d.denied,
    approval: d.approval,
    allowed: Math.max(0, d.requests - d.denied - d.approval),
  }));
  const total = o.agents.active + o.agents.suspended + o.agents.revoked;

  return (
    <>
      <PageHeader
        title="Overview"
        description={`See ${org.organizationName}’s agents, what needs your attention, and what they have been up to.`}
      />

      <section aria-label="Summary" className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <MetricCard
          title="Connected Agents"
          value={o.agents.active}
          helper={`of ${String(total)} agents are active`}
          href="/dashboard/agents"
          linkLabel="see all agents"
        />
        <MetricCard
          title="Pending Approvals"
          value={o.pendingApprovals}
          helper={
            o.pendingApprovals === 1 ? "request needs a decision" : "requests need a decision"
          }
          href="/dashboard/approvals"
          linkLabel="review pending approvals"
          tone={o.pendingApprovals > 0 ? "attention" : "neutral"}
        />
        <MetricCard
          title="Blocked Actions"
          value={o.last24Hours.denied}
          helper="stopped by your rules in the last 24 hours"
          href="/dashboard/audit"
          linkLabel="see recent activity"
          tone={o.last24Hours.denied > 0 ? "blocked" : "neutral"}
        />
      </section>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          id="requests-chart"
          title="Recent requests"
          description="What your agents asked to do over the last 7 days, and how each request was answered."
          className="xl:col-span-12"
        >
          <RequestsChart
            data={days}
            caption="Requests per day over the last 7 days, split into allowed, needs approval and blocked."
          />
        </Panel>

        <Panel
          id="my-agents"
          title="My Agents"
          description="The agents you have set up, and what each one is for."
          action={{ href: "/dashboard/agents", label: `See all ${String(total)}` }}
          flush
          className="xl:col-span-7"
        >
          {agents.ok && agents.data.length > 0 ? (
            <LiveAgentList agents={agents.data.slice(0, 5)} />
          ) : (
            <div className="px-6 pb-6">
              <EmptyState
                icon={<Bot aria-hidden="true" />}
                title={agents.ok ? "No agents yet" : "Agents couldn’t be loaded"}
                description={
                  agents.ok ? "Add your first agent under My Agents." : "Reload to try again."
                }
              />
            </div>
          )}
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
          {pending.ok && pending.data.length > 0 ? (
            <ul>
              {pending.data.map((a) => (
                <li key={a.id} className="border-t border-border/50 px-6 py-5 first:border-t-0">
                  <h3 className="text-base font-medium">{a.agentName}</h3>
                  <p className="mt-1 text-base">Wants to {actionVerb(a.action)}</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Asked {relativeTime(a.createdAt)} ·{" "}
                    <Link
                      href="/dashboard/approvals"
                      className="font-medium text-primary-text hover:underline"
                    >
                      Review
                    </Link>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-6 pb-6 text-base text-muted-foreground">Nothing is waiting for you.</p>
          )}
        </Panel>

        <Panel
          id="recent-activity"
          title="Recent Activity"
          description="The latest things your agents asked to do, and what happened."
          action={{ href: "/dashboard/audit", label: "See all activity" }}
          flush
          className="xl:col-span-12"
        >
          {requests.ok && requests.data.length > 0 ? (
            <ul>
              {requests.data.map((r) => (
                <LiveRequestItem key={r.id} request={r} details={false} />
              ))}
            </ul>
          ) : (
            <p className="px-6 pb-6 text-base text-muted-foreground">
              No requests yet. When an agent asks to do something, it shows up here.
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
