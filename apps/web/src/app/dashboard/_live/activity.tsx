import { HelpTip } from "@/components/dashboard/help-tip";
import { Panel } from "@/components/dashboard/panel";
import { PageHeader } from "@/components/layout/page-header";
import { LiveEventList, LiveRequestItem } from "@/components/live/records";
import type { ApprovalFact } from "@/lib/api/present";
import type { LiveSession } from "@/lib/api/server";
import { GLOSSARY } from "@/lib/plain-language";
import { gate, LoadFailed } from "./gate";
import { getActivity, getApprovals, getMembers, getRequests, memberEmails } from "./data";

export async function LiveActivityPage({ session }: { session: LiveSession }) {
  const g = gate(session, "Activity");
  if (!("ready" in g)) return g.node;
  const { org } = g.ready;
  const [requests, approvals, events, members] = await Promise.all([
    getRequests(org.base, 50),
    getApprovals(org.base, "all", 200),
    getActivity(org.base, 40),
    getMembers(org.base),
  ]);
  if (!requests.ok) return <LoadFailed what="Activity" />;
  const approvalByRequest = new Map<string, ApprovalFact>();
  if (approvals.ok) for (const a of approvals.data) approvalByRequest.set(a.requestId, a.state);

  return (
    <>
      <PageHeader
        title="Activity"
        description="Everything your agents asked to do, and what happened to each request."
      />
      <p className="mb-8 flex max-w-3xl items-start gap-1.5 text-base leading-relaxed text-muted-foreground">
        <span>
          “Completed” is the only status that means the action actually ran. Open any item to see
          the permission check, the approval and the result as separate steps.
        </span>
        <HelpTip term="Result">{GLOSSARY.result}</HelpTip>
      </p>

      <div className="space-y-6">
        <Panel id="requests" title="Requests" description="The latest 50, newest first." flush>
          {requests.data.length === 0 ? (
            <p className="px-6 pb-6 text-base text-muted-foreground">
              No requests yet. When an agent asks to do something, it shows up here.
            </p>
          ) : (
            <ul>
              {requests.data.map((r) => (
                <LiveRequestItem key={r.id} request={r} approval={approvalByRequest.get(r.id)} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          id="trail"
          title="Audit trail"
          description="Each step recorded as it happened. The details people submitted are never copied into this list."
          flush
        >
          {events.ok && events.data.length > 0 ? (
            <LiveEventList events={events.data} members={memberEmails(members)} />
          ) : (
            <p className="px-6 pb-6 text-base text-muted-foreground">
              {events.ok ? "Nothing recorded yet." : "The audit trail couldn’t be loaded."}
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
