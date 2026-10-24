import { ApprovalsView } from "@/components/dashboard/approvals-view";
import { DemoBadge } from "@/components/feedback/demo-notice";
import { PageHeader } from "@/components/layout/page-header";
import { approvalCenterRequests } from "@/mocks/dashboard";

export function DemoApprovalsPage() {
  return (
    <>
      <PageHeader
        title="Approvals"
        description="Some actions wait for a person to say yes. Look at what the agent wants to do, then decide."
        actions={<DemoBadge />}
      />
      <p className="mb-8 max-w-3xl text-base leading-relaxed text-muted-foreground">
        Saying yes gives permission; it doesn’t mean the action has happened yet. Approve and Reject
        are switched off in this demo because there is no backend to carry them out.
      </p>
      <ApprovalsView requests={approvalCenterRequests()} />
    </>
  );
}
