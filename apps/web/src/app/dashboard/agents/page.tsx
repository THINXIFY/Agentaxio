import type { Metadata } from "next";
import { DemoAgentsPage } from "@/app/dashboard/_demo/agents";
import { LiveAgentsPage } from "@/app/dashboard/_live/agents";
import { loadSession } from "@/lib/api/server";

export const metadata: Metadata = { title: "My Agents" };

/** Demo mode (no AXO_API_URL): the labelled sample dashboard. Otherwise the live page, which asks the API for everything. */
export default async function AgentsPage() {
  const session = await loadSession();
  return session.kind === "demo" ? <DemoAgentsPage /> : <LiveAgentsPage session={session} />;
}
