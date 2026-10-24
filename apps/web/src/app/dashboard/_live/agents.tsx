import { notFound } from "next/navigation";
import Link from "next/link";
import { Bot } from "lucide-react";
import { Panel } from "@/components/dashboard/panel";
import { PageHeader } from "@/components/layout/page-header";
import { AgentStatusActions, CreateAgentForm, CredentialsPanel } from "@/components/live/forms";
import { LiveAgentList, LiveAgentStatusBadge, LiveRequestItem } from "@/components/live/records";
import { EmptyState } from "@/components/ui/misc";
import { conditionsText, relativeTime } from "@/lib/api/present";
import { canManage, type LiveSession } from "@/lib/api/server";
import { formatDateTimeUtc } from "@/lib/format";
import { PLAIN_EFFECT } from "@/lib/plain-language";
import { gate, LoadFailed } from "./gate";
import {
  getAgents,
  getCredentials,
  getEnvironments,
  getMembers,
  getPolicies,
  getRequests,
  memberEmails,
} from "./data";

export async function LiveAgentsPage({ session }: { session: LiveSession }) {
  const g = gate(session, "My Agents");
  if (!("ready" in g)) return g.node;
  const { org, me } = g.ready;
  const [agents, environments] = await Promise.all([
    getAgents(org.base),
    getEnvironments(org.base),
  ]);
  if (!agents.ok) return <LoadFailed what="Your agents" />;
  const manager = canManage(org.role);

  return (
    <>
      <PageHeader
        title="My Agents"
        description="The agents you have set up, and what each one is for."
      />
      <Panel id="all-agents" title={`${String(agents.data.length)} agents`} flush>
        {agents.data.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState
              icon={<Bot aria-hidden="true" />}
              title="No agents yet"
              description={
                manager
                  ? "Add your first agent below."
                  : "An owner or admin can add agents for this organization."
              }
            />
          </div>
        ) : (
          <LiveAgentList agents={agents.data} />
        )}
      </Panel>

      {manager && environments.ok ? (
        <Panel
          id="add-agent"
          title="Add an agent"
          description="Register an agent, then give it an access key."
          className="mt-6"
        >
          <CreateAgentForm
            orgBase={org.base}
            environments={environments.data}
            ownerUserId={me.userId}
          />
        </Panel>
      ) : null}
    </>
  );
}

export async function LiveAgentDetailPage({ session, id }: { session: LiveSession; id: string }) {
  const g = gate(session, "Agent");
  if (!("ready" in g)) return g.node;
  const { org } = g.ready;
  const agents = await getAgents(org.base);
  if (!agents.ok) return <LoadFailed what="This agent" />;
  const agent = agents.data.find((a) => a.id === id);
  if (agent === undefined) notFound();

  const [credentials, policies, requests, members] = await Promise.all([
    getCredentials(org.base, id),
    getPolicies(org.base),
    getRequests(org.base, 5, id),
    getMembers(org.base),
  ]);
  const owner = memberEmails(members).get(agent.ownerUserId);
  const manager = canManage(org.role);
  const rules = policies.ok
    ? policies.data.filter((p) => p.enabled && (p.agentId === id || p.agentId === null))
    : [];
  const order = ["deny", "require_approval", "allow"];
  rules.sort((a, b) => order.indexOf(a.effect) - order.indexOf(b.effect));

  return (
    <>
      <PageHeader
        title={agent.name}
        description={agent.description ?? "No description yet."}
        back={{ href: "/dashboard/agents", label: "Back to My Agents" }}
        actions={<LiveAgentStatusBadge status={agent.status} />}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-5">
          <Panel id="about" title="About this agent">
            <dl className="space-y-4 text-base">
              <div className="flex items-start justify-between gap-6">
                <dt className="text-muted-foreground">Owner</dt>
                <dd className="text-right">{owner ?? "A team member"}</dd>
              </div>
              <div className="flex items-start justify-between gap-6">
                <dt className="text-muted-foreground">Environment</dt>
                <dd>{agent.environment}</dd>
              </div>
              <div className="flex items-start justify-between gap-6">
                <dt className="text-muted-foreground">Added</dt>
                <dd>{formatDateTimeUtc(agent.createdAt)}</dd>
              </div>
              <div className="flex items-start justify-between gap-6">
                <dt className="text-muted-foreground">Last request</dt>
                <dd>
                  {agent.lastRequestAt ? relativeTime(agent.lastRequestAt) : "No requests yet"}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel
            id="access-keys"
            title="Access keys"
            description="A key lets a tool such as n8n ask AgentAxio for permission as this agent."
          >
            {credentials.ok ? (
              <CredentialsPanel
                orgBase={org.base}
                agentId={id}
                agentStatus={agent.status}
                credentials={credentials.data}
                canManage={manager}
              />
            ) : (
              <LoadFailed what="The access keys" />
            )}
          </Panel>

          {manager ? (
            <Panel id="switch-off" title="Switch off">
              <AgentStatusActions orgBase={org.base} agentId={id} status={agent.status} />
            </Panel>
          ) : null}
        </div>

        <div className="space-y-6 xl:col-span-7">
          <Panel
            id="can-do"
            title="What it can do"
            description="Rules that apply to this agent. Anything not covered by a rule is blocked."
          >
            {rules.length === 0 ? (
              <p className="text-base text-muted-foreground">
                No rule covers this agent yet, so every request it makes is blocked.{" "}
                <Link
                  href="/dashboard/policies"
                  className="font-medium text-primary-text hover:underline"
                >
                  Go to Permissions
                </Link>
              </p>
            ) : (
              <ul className="space-y-3 text-base">
                {rules.map((r) => (
                  <li key={r.id}>
                    <span className="font-medium">{PLAIN_EFFECT[r.effect]}</span> when{" "}
                    {conditionsText(r.conditions)}
                    <span className="text-muted-foreground">
                      {" "}
                      · {r.agentId === null ? "set for every agent" : "set for this agent"}
                      {r.environment !== null ? ` · ${r.environment} only` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel id="agent-activity" title="Recent activity" flush>
            {requests.ok && requests.data.length > 0 ? (
              <ul>
                {requests.data.map((r) => (
                  <LiveRequestItem key={r.id} request={r} details={false} />
                ))}
              </ul>
            ) : (
              <p className="px-6 pb-6 text-base text-muted-foreground">
                This agent hasn’t made any requests yet.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
