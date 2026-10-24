import { CheckCheck } from "lucide-react";
import { HelpTip } from "@/components/dashboard/help-tip";
import { Panel } from "@/components/dashboard/panel";
import { PageHeader } from "@/components/layout/page-header";
import { PendingApprovalCard } from "@/components/live/approval-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { actionVerb, relativeTime } from "@/lib/api/present";
import { canDecideApprovals, type LiveSession } from "@/lib/api/server";
import type { ApiApprovalReview, ApiApprovalSummary } from "@/lib/api/types";
import { GLOSSARY } from "@/lib/plain-language";
import { gate, LoadFailed } from "./gate";
import { getApprovalReview, getApprovals, getMembers, memberEmails } from "./data";

const REVIEWED_LABEL: Record<
  ApiApprovalSummary["state"],
  { label: string; tone: "success" | "danger" | "warning" | "neutral" }
> = {
  pending: { label: "Waiting", tone: "warning" },
  approved: { label: "Approved · not necessarily run", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
  canceled: { label: "Withdrawn", tone: "neutral" },
};

const MAX_REVIEWED_SHOWN = 20;

export async function LiveApprovalsPage({ session }: { session: LiveSession }) {
  const g = gate(session, "Approvals");
  if (!("ready" in g)) return g.node;
  const { org } = g.ready;
  const decider = canDecideApprovals(org.role);

  const [all, members] = await Promise.all([
    getApprovals(org.base, "all", 100),
    getMembers(org.base),
  ]);
  if (!all.ok) return <LoadFailed what="Approvals" />;
  const emails = memberEmails(members);
  // The API reports an approval past its deadline as expired, so no clock is read here.
  const pending = all.data.filter((a) => a.state === "pending");
  const reviewed = all.data.filter((a) => !pending.includes(a)).slice(0, MAX_REVIEWED_SHOWN);

  // The exact submitted values are released by the server to owners, admins and approvers only.
  const reviews = new Map<string, ApiApprovalReview>();
  if (decider) {
    const loaded = await Promise.all(pending.map((a) => getApprovalReview(org.base, a.id)));
    loaded.forEach((r, i) => {
      const id = pending[i]?.id;
      if (r.ok && id !== undefined) reviews.set(id, r.data);
    });
  }

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Some actions wait for a person to say yes. Look at what the agent wants to do, then decide."
      />
      <p className="mb-8 max-w-3xl text-base leading-relaxed text-muted-foreground">
        Saying yes gives permission once; it doesn’t mean the action has happened yet. You can’t
        decide a request from an agent you own or set up, and deciding asks you to confirm with
        multi-factor authentication.
      </p>

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
              {pending.map((a) => (
                <li key={a.id} className="flex">
                  <PendingApprovalCard
                    orgBase={org.base}
                    approval={a}
                    review={reviews.get(a.id) ?? null}
                    canDecide={decider}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {reviewed.length > 0 ? (
          <Panel
            id="reviewed"
            title="Already reviewed"
            description="Requests that were decided, expired or withdrawn, newest first."
            flush
          >
            <ul>
              {reviewed.map((a) => {
                const shown = REVIEWED_LABEL[a.state === "pending" ? "expired" : a.state];
                const by =
                  a.decidedBy !== null ? (emails.get(a.decidedBy) ?? "a team member") : null;
                return (
                  <li
                    key={a.id}
                    className="grid grid-cols-1 gap-x-5 gap-y-2 border-t border-border/50 px-6 py-4 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <h3 className="text-base font-medium">{a.agentName}</h3>
                      <p className="text-sm text-muted-foreground">
                        Wanted to {actionVerb(a.action)} · asked {relativeTime(a.createdAt)}
                        {by !== null && a.decidedAt !== null
                          ? ` · decided by ${by} ${relativeTime(a.decidedAt)}`
                          : ""}
                      </p>
                    </div>
                    <Badge tone={shown.tone}>{shown.label}</Badge>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ) : null}
      </div>
    </>
  );
}
