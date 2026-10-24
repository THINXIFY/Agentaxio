import { notFound } from "next/navigation";
import { ActivityItem } from "@/components/dashboard/activity-item";
import { CredentialPreview } from "@/components/dashboard/agent-identity-card";
import { HelpTip } from "@/components/dashboard/help-tip";
import { Panel } from "@/components/dashboard/panel";
import { PermissionSummary } from "@/components/dashboard/permission-summary";
import { PlainAgentStatusBadge } from "@/components/dashboard/plain-status";
import { DemoBadge } from "@/components/feedback/demo-notice";
import { PageHeader } from "@/components/layout/page-header";
import { formatDateTimeUtc } from "@/lib/format";
import { GLOSSARY, PLAIN_AGENT_STATUS } from "@/lib/plain-language";
import { formatAgo, getDashboardAgent, requestsForAgent } from "@/mocks/dashboard";

export function DemoAgentDetail({ id }: { id: string }) {
  const agent = getDashboardAgent(id);
  if (!agent) notFound();

  const recent = requestsForAgent(agent.id).slice(0, 3);

  return (
    <>
      <PageHeader
        title={agent.name}
        description={agent.description}
        back={{ href: "/dashboard/agents", label: "Back to My Agents" }}
        actions={
          <>
            <PlainAgentStatusBadge status={agent.status} />
            <DemoBadge />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-5">
          <Panel id="about" title="About this agent">
            <dl className="space-y-4 text-base">
              <div className="flex items-start justify-between gap-6">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="text-right">{PLAIN_AGENT_STATUS[agent.status].explanation}</dd>
              </div>
              <div className="flex items-start justify-between gap-6">
                <dt className="text-muted-foreground">Owner</dt>
                <dd>{agent.owner}</dd>
              </div>
              <div className="flex items-start justify-between gap-6">
                <dt className="text-muted-foreground">Environment</dt>
                <dd>{agent.environment}</dd>
              </div>
              <div className="flex items-start justify-between gap-6">
                <dt className="text-muted-foreground">Last request</dt>
                <dd>
                  {agent.lastRequestAt ? (
                    <time
                      dateTime={agent.lastRequestAt}
                      title={formatDateTimeUtc(agent.lastRequestAt)}
                    >
                      {formatAgo(agent.lastRequestAt)}
                    </time>
                  ) : (
                    "No requests yet"
                  )}
                </dd>
              </div>
            </dl>
            <div className="mt-6 border-t border-border/60 pt-6">
              <CredentialPreview agent={agent} />
            </div>
          </Panel>
        </div>

        <div className="space-y-6 xl:col-span-7">
          <Panel
            id="can-do"
            title="What it can do"
            aside={<HelpTip term="Permission check">{GLOSSARY.permissionCheck}</HelpTip>}
          >
            <PermissionSummary permissions={agent.permissions} />
          </Panel>

          <Panel id="agent-activity" title="Recent activity" flush>
            {recent.length === 0 ? (
              <p className="px-6 pb-6 text-base text-muted-foreground">
                This agent hasn’t made any requests yet.
              </p>
            ) : (
              <ul>
                {recent.map((r) => (
                  <ActivityItem key={r.id} request={r} />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
