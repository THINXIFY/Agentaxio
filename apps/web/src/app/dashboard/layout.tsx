import type { Metadata } from "next";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { ShellMode } from "@/components/layout/shell-mode";
import { isLiveMode } from "@/lib/api/config";
import { loadOverview, loadSession } from "@/lib/api/server";

export function generateMetadata(): Metadata {
  return isLiveMode()
    ? { title: { default: "Dashboard", template: "%s · Dashboard · AgentAxio" } }
    : { title: { default: "Dashboard (demo)", template: "%s · Dashboard (demo) · AgentAxio" } };
}

async function shellMode(): Promise<ShellMode> {
  const session = await loadSession();
  switch (session.kind) {
    case "demo":
      return { mode: "demo" };
    case "ready": {
      const overview = await loadOverview(session.org.base);
      return {
        mode: "live",
        state: "ready",
        email: session.me.email,
        organization: session.org.organizationName,
        role: session.org.role,
        pendingApprovals: overview.ok ? overview.data.pendingApprovals : 0,
      };
    }
    case "no-organization":
      return { mode: "live", state: "no-organization", email: session.me.email };
    default:
      return { mode: "live", state: session.kind };
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell mode={await shellMode()}>{children}</DashboardShell>;
}
