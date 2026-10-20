import type { Metadata } from "next";
import { ActivityHistory } from "@/components/dashboard/activity-history";
import { HelpTip } from "@/components/dashboard/help-tip";
import { DemoBadge } from "@/components/feedback/demo-notice";
import { PageHeader } from "@/components/layout/page-header";
import { GLOSSARY } from "@/lib/plain-language";
import { listDashboardRequests } from "@/mocks/dashboard";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <>
      <PageHeader
        title="Activity"
        description="Everything your agents asked to do, and what happened to each request."
        actions={<DemoBadge />}
      />
      <p className="mb-8 flex max-w-3xl items-start gap-1.5 text-base leading-relaxed text-muted-foreground">
        <span>
          “Completed” is the only status that means the action actually ran. Open any item to see
          the permission check, the approval and the result as separate steps.
        </span>
        <HelpTip term="Result">{GLOSSARY.result}</HelpTip>
      </p>
      <ActivityHistory requests={listDashboardRequests()} />
    </>
  );
}
