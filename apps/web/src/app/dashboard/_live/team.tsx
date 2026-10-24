import { Panel } from "@/components/dashboard/panel";
import { PageHeader } from "@/components/layout/page-header";
import { InviteForm } from "@/components/live/forms";
import { Badge } from "@/components/ui/badge";
import { canManage, type LiveSession } from "@/lib/api/server";
import { formatDateTimeUtc } from "@/lib/format";
import { gate, LoadFailed } from "./gate";
import { getMembers } from "./data";

const ROLE_TEXT: Record<string, string> = {
  owner: "Owner · full control",
  admin: "Admin · manages agents and rules",
  approver: "Approver · decides requests",
  viewer: "Viewer · read only",
};

export async function LiveTeamPage({ session }: { session: LiveSession }) {
  const g = gate(session, "Team & Organization");
  if (!("ready" in g)) return g.node;
  const { org } = g.ready;
  const members = await getMembers(org.base);
  if (!members.ok) return <LoadFailed what="The team" />;
  return (
    <>
      <PageHeader
        title="Team & Organization"
        description={`Who can manage agents and approve requests in ${org.organizationName}.`}
      />
      <Panel id="members" title={`${String(members.data.length)} members`} flush>
        <ul>
          {members.data.map((m) => (
            <li
              key={m.userId}
              className="grid grid-cols-1 gap-x-5 gap-y-2 border-t border-border/50 px-6 py-4 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="text-base font-medium break-all">{m.email ?? "Email not shared"}</p>
                <p className="text-sm text-muted-foreground">
                  Joined {formatDateTimeUtc(m.createdAt)}
                </p>
              </div>
              <Badge tone="neutral">{ROLE_TEXT[m.role] ?? m.role}</Badge>
            </li>
          ))}
        </ul>
      </Panel>
      {canManage(org.role) ? (
        <Panel
          id="invite"
          title="Invite a colleague"
          description="Approvals need a second person: nobody can approve their own agent’s requests."
          className="mt-6"
        >
          <InviteForm orgBase={org.base} />
        </Panel>
      ) : null}
      <p className="mt-6 max-w-3xl text-base leading-relaxed text-muted-foreground">
        <Badge tone="neutral" className="mr-2">
          Not built yet
        </Badge>
        Changing roles and removing people is available through the API but has no screen yet.
      </p>
    </>
  );
}
