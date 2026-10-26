import type { Metadata } from "next";
import { DemoIntegrationsPage } from "@/app/dashboard/_demo/integrations";
import { LiveIntegrationsPage } from "@/app/dashboard/_live/integrations";
import { loadSession } from "@/lib/api/server";

export const metadata: Metadata = { title: "Integrations" };

/** Demo mode (no AXO_API_URL): the labelled sample page. Otherwise the live page, with real connection status. */
export default async function IntegrationsPage() {
  const session = await loadSession();
  return session.kind === "demo" ? (
    <DemoIntegrationsPage />
  ) : (
    <LiveIntegrationsPage session={session} />
  );
}
