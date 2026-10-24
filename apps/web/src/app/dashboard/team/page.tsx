import type { Metadata } from "next";
import { DemoTeamPage } from "@/app/dashboard/_demo/team";
import { LiveTeamPage } from "@/app/dashboard/_live/team";
import { loadSession } from "@/lib/api/server";

export const metadata: Metadata = { title: "Team & Organization" };

/** Demo mode (no AXO_API_URL): the labelled sample dashboard. Otherwise the live page, which asks the API for everything. */
export default async function TeamPage() {
  const session = await loadSession();
  return session.kind === "demo" ? <DemoTeamPage /> : <LiveTeamPage session={session} />;
}
