import type { Metadata } from "next";
import { Panel } from "@/components/dashboard/panel";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Choose how the dashboard looks, and see details of this workspace."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          id="appearance"
          title="Appearance"
          description="Light, Dark, or follow your device. This is remembered in this browser only."
          className="xl:col-span-6 xl:self-start"
        >
          <ThemeSwitcher showLabels />
        </Panel>

        <Panel
          id="workspace"
          title="Workspace"
          description="Read-only in the demo."
          className="xl:col-span-6 xl:self-start"
        >
          <dl className="space-y-4 text-base">
            <div className="flex items-center justify-between gap-6">
              <dt className="text-muted-foreground">Name</dt>
              <dd>Demo workspace</dd>
            </div>
            <div className="flex items-center justify-between gap-6">
              <dt className="text-muted-foreground">Environment</dt>
              <dd>dev</dd>
            </div>
            <div className="flex items-center justify-between gap-6">
              <dt className="text-muted-foreground">Data</dt>
              <dd>
                <Badge tone="brand">Sample data</Badge>
              </dd>
            </div>
          </dl>
        </Panel>
      </div>

      <p className="mt-8 max-w-3xl text-base leading-relaxed text-muted-foreground">
        Account, notification and security settings arrive with sign-in. Team and Billing are in the
        menu on the left and are not built yet.
      </p>
    </>
  );
}
