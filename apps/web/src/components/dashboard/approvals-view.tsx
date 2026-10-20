import * as React from "react";
import { CheckCheck } from "lucide-react";
import { ActivityItem } from "@/components/dashboard/activity-item";
import { ApprovalCard } from "@/components/dashboard/approval-card";
import { HelpTip } from "@/components/dashboard/help-tip";
import { Panel } from "@/components/dashboard/panel";
import { EmptyState } from "@/components/ui/misc";
import { GLOSSARY } from "@/lib/plain-language";
import type { DashboardRequest } from "@/mocks/dashboard";

/**
 * Approvals in two plain groups instead of tabs: what is waiting for a person, and what a person has already dealt with.
 * Approve / Reject exist only as clearly disabled demo controls.
 */
export function ApprovalsView({ requests }: { requests: readonly DashboardRequest[] }) {
  const pending = requests.filter((r) => r.status === "pending_approval");
  const reviewed = requests.filter((r) => r.status !== "pending_approval");

  return (
    <div className="space-y-10">
      <section aria-labelledby="needs-review-title">
        <div className="mb-5 flex items-center gap-1.5">
          <h2 id="needs-review-title" className="text-xl font-semibold tracking-tight">
            Waiting for review ({pending.length})
          </h2>
          <HelpTip term="Approval">{GLOSSARY.approval}</HelpTip>
        </div>
        {pending.length === 0 ? (
          <EmptyState
            icon={<CheckCheck aria-hidden="true" />}
            title="Nothing is waiting for you"
            description="When an agent asks to do something that needs a person’s approval, it will show up here."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {pending.map((r) => (
              <li key={r.id} className="flex">
                <ApprovalCard request={r} headingLevel={3} className="w-full" />
              </li>
            ))}
          </ul>
        )}
      </section>

      {reviewed.length > 0 ? (
        <Panel
          id="reviewed"
          title="Already reviewed"
          description="Requests that a person has dealt with, and where they ended up."
          flush
        >
          <ul>
            {reviewed.map((r) => (
              <ActivityItem key={r.id} request={r} details />
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
