import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/planned-page";

export const metadata: Metadata = { title: "Team & Organization" };

export default function TeamPage() {
  return (
    <PlannedPage
      title="Team & Organization"
      description="Who can manage agents, and who can approve their requests."
      milestone="Arrives with accounts and memberships (docs/ROADMAP.md phase 4)."
      willInclude={[
        "Invite people and give each a role: owner, admin, approver or viewer.",
        "Keep approvers separate from requesters, so nobody approves their own request.",
        "Review who can administer policies, agents and integrations.",
        "Manage organization details and environments.",
      ]}
      note="Role labels in the interface confer no rights. Every permission is checked on the server."
    />
  );
}
