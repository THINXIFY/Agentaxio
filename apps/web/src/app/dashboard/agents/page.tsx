import type { Metadata } from "next";
import Link from "next/link";
import { AgentList } from "@/components/dashboard/agent-list";
import { Panel } from "@/components/dashboard/panel";
import { DemoBadge } from "@/components/feedback/demo-notice";
import { PageHeader } from "@/components/layout/page-header";
import { listDashboardAgents } from "@/mocks/dashboard";

export const metadata: Metadata = { title: "My Agents" };

export default function AgentsPage() {
  // Active agents first; the list is short, so there are no filters or search.
  const agents = [...listDashboardAgents()].sort(
    (a, b) => Number(b.status === "active") - Number(a.status === "active"),
  );
  return (
    <>
      <PageHeader
        title="My Agents"
        description="The agents you have set up, and what each one is for."
        actions={<DemoBadge />}
      />
      <Panel id="all-agents" title={`${agents.length} agents`} flush>
        <AgentList agents={agents} />
      </Panel>
      <p className="mt-6 text-base text-muted-foreground">
        Looking for an agent’s access key?{" "}
        <Link
          href="/dashboard/identities"
          className="font-medium text-primary-text hover:underline"
        >
          See agent identities
        </Link>
        .
      </p>
    </>
  );
}
