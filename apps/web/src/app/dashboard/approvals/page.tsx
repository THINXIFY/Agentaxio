import type { Metadata } from "next";
import { DemoApprovalsPage } from "@/app/dashboard/_demo/approvals";
import { LiveApprovalsPage } from "@/app/dashboard/_live/approvals";
import { loadSession } from "@/lib/api/server";

export const metadata: Metadata = { title: "Approvals" };

/** Demo mode (no AXO_API_URL): the labelled sample dashboard. Otherwise the live page, which asks the API for everything. */
export default async function ApprovalsPage() {
  const session = await loadSession();
  return session.kind === "demo" ? <DemoApprovalsPage /> : <LiveApprovalsPage session={session} />;
}
