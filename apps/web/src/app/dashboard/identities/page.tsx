import type { Metadata } from "next";
import { AgentIdentityCard } from "@/components/dashboard/agent-identity-card";
import { DemoBadge } from "@/components/feedback/demo-notice";
import { PageHeader } from "@/components/layout/page-header";
import { listDashboardAgents } from "@/mocks/dashboard";

export const metadata: Metadata = { title: "Agent Identities" };

export default function IdentitiesPage() {
  return (
    <>
      <PageHeader
        title="Agent Identities"
        description="Each agent proves who it is with a private access key. This page shows the safe preview of each one."
        back={{ href: "/dashboard/agents", label: "Back to My Agents" }}
        actions={<DemoBadge />}
      />
      <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {listDashboardAgents().map((a) => (
          <li key={a.id} className="flex">
            <div className="flex w-full">
              <AgentIdentityCard agent={a} headingLevel={2} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-8 max-w-3xl text-base leading-relaxed text-muted-foreground">
        AgentAxio works out which agent is asking from its key, never from what the request claims.
        Real keys are shown once when they’re created and are never kept in your browser, so only a
        preview appears here.
      </p>
    </>
  );
}
