import type { Metadata } from "next";
import { DemoIdentitiesPage } from "@/app/dashboard/_demo/identities";
import { LiveIdentitiesPage } from "@/app/dashboard/_live/identities";
import { loadSession } from "@/lib/api/server";

export const metadata: Metadata = { title: "Agent Identities" };

/** Demo mode (no AXO_API_URL): the labelled sample dashboard. Otherwise the live page, which asks the API for everything. */
export default async function IdentitiesPage() {
  const session = await loadSession();
  return session.kind === "demo" ? (
    <DemoIdentitiesPage />
  ) : (
    <LiveIdentitiesPage session={session} />
  );
}
