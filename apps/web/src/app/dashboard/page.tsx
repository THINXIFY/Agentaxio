import type { Metadata } from "next";
import { DemoOverviewPage } from "@/app/dashboard/_demo/overview";
import { LiveOverviewPage } from "@/app/dashboard/_live/overview";
import { loadSession } from "@/lib/api/server";

export const metadata: Metadata = { title: "Overview" };

/** Demo mode (no AXO_API_URL): the labelled sample dashboard. Otherwise the live page, which asks the API for everything. */
export default async function OverviewPage() {
  const session = await loadSession();
  return session.kind === "demo" ? <DemoOverviewPage /> : <LiveOverviewPage session={session} />;
}
