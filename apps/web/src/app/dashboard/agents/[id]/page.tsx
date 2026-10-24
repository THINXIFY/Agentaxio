import type { Metadata } from "next";
import { DemoAgentDetail } from "@/app/dashboard/_demo/agent-detail";
import { LiveAgentDetailPage } from "@/app/dashboard/_live/agents";
import { loadSession } from "@/lib/api/server";
import { getDashboardAgent } from "@/mocks/dashboard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // Live agent names are not read here (the page itself asks the API); the demo names are public sample data.
  return { title: getDashboardAgent(id)?.name ?? "Agent" };
}

/** Rendered on demand: in live mode the ids are real records, and in demo mode an unknown id is a 404. */
export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await loadSession();
  return session.kind === "demo" ? (
    <DemoAgentDetail id={id} />
  ) : (
    <LiveAgentDetailPage session={session} id={id} />
  );
}
