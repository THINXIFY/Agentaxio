import type { Metadata } from "next";
import { DemoActivityPage } from "@/app/dashboard/_demo/activity";
import { LiveActivityPage } from "@/app/dashboard/_live/activity";
import { loadSession } from "@/lib/api/server";

export const metadata: Metadata = { title: "Activity" };

/** Demo mode (no AXO_API_URL): the labelled sample dashboard. Otherwise the live page, which asks the API for everything. */
export default async function ActivityPage() {
  const session = await loadSession();
  return session.kind === "demo" ? <DemoActivityPage /> : <LiveActivityPage session={session} />;
}
