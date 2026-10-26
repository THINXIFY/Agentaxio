import { Panel } from "@/components/dashboard/panel";
import { integrationGroups, PlannedIntegrations } from "@/components/dashboard/integration-status";
import { PageHeader } from "@/components/layout/page-header";
import { N8nCard, SetupSteps, TestGuide } from "@/components/live/n8n-integration";
import { DEFAULT_AGENT_API_URL, describeConnection } from "@/lib/api/connection";
import type { LiveSession } from "@/lib/api/server";
import { gate, LoadFailed } from "./gate";
import { getAgents } from "./data";

const TECHNICAL = [
  "The n8n workflow holds only its AgentAxio key, never the downstream tool’s own credentials.",
  "Only AgentAxio’s trusted executor holds the tool’s credentials and carries out the action.",
  "The permission to run an action is private to AgentAxio and is never sent to the workflow.",
  "If AgentAxio can’t be reached, the protected action does not run.",
  "AgentAxio controls actions that go through it. A workflow that still holds its own direct credentials to a tool can bypass it, so those credentials move to AgentAxio.",
] as const;

export async function LiveIntegrationsPage({ session }: { session: LiveSession }) {
  const g = gate(session, "Integrations");
  if (!("ready" in g)) return g.node;
  const { org } = g.ready;
  const agents = await getAgents(org.base);
  if (!agents.ok) return <LoadFailed what="Integrations" />;

  // Display only: where n8n should send requests. Read on the server; never a secret.
  const configured = process.env.AXO_AGENT_API_URL?.trim();
  const agentApiUrl =
    configured === undefined || configured === "" ? DEFAULT_AGENT_API_URL : configured;
  const { others } = integrationGroups();

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect n8n so its workflows ask AgentAxio before an agent acts."
      />

      <div className="space-y-10">
        <N8nCard connection={describeConnection(agents.data)} />

        <Panel
          id="setup"
          title="Set it up"
          description="Four steps. Takes a few minutes the first time."
        >
          <SetupSteps
            agentApiUrl={agentApiUrl}
            urlIsDefault={configured === undefined || configured === ""}
          />
        </Panel>

        <Panel
          id="test"
          title="Test it"
          description="See the whole path once: n8n asks, a person approves, AgentAxio carries it out."
        >
          <TestGuide />
        </Panel>

        <Panel id="how" title="What stays safe">
          <ul className="max-w-3xl space-y-3 text-base leading-relaxed">
            {TECHNICAL.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground"
                />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <section aria-labelledby="more-title">
          <h2 id="more-title" className="text-xl font-semibold tracking-tight">
            More integrations
          </h2>
          <PlannedIntegrations integrations={others} className="mt-5" />
        </section>
      </div>
    </>
  );
}
