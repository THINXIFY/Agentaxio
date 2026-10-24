import type { Metadata } from "next";
import { DemoPermissionsPage } from "@/app/dashboard/_demo/permissions";
import { LivePermissionsPage } from "@/app/dashboard/_live/permissions";
import { loadSession } from "@/lib/api/server";

export const metadata: Metadata = { title: "Permissions" };

/** Demo mode (no AXO_API_URL): the labelled sample dashboard. Otherwise the live page, which asks the API for everything. */
export default async function PermissionsPage() {
  const session = await loadSession();
  return session.kind === "demo" ? (
    <DemoPermissionsPage />
  ) : (
    <LivePermissionsPage session={session} />
  );
}
