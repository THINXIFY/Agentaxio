import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import type { LiveSession } from "@/lib/api/server";
import { gate } from "./gate";

/** Access keys are managed on each agent’s own page; this older address now just points there. */
export function LiveIdentitiesPage({ session }: { session: LiveSession }) {
  const g = gate(session, "Agent Identities");
  if (!("ready" in g)) return g.node;
  return (
    <>
      <PageHeader
        title="Agent Identities"
        description="Each agent has its own access keys. They are managed on the agent’s page."
      />
      <p className="text-base">
        <Link href="/dashboard/agents" className="font-medium text-primary-text hover:underline">
          Go to My Agents
        </Link>{" "}
        and open an agent to create, replace or revoke its keys. A key is shown once when it is
        created and is never stored in the browser.
      </p>
    </>
  );
}
