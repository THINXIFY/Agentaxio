import { CheckCircle2, ShieldX } from "lucide-react";
import { getActionRequestPresentation } from "@/components/domain/status-badge";
import { Badge } from "@/components/ui/badge";
import type { ActionRequestStatus, AgentStatus } from "@/lib/contracts";
import { PLAIN_AGENT_STATUS, PLAIN_STATUS } from "@/lib/plain-language";

/**
 * Status of a request in everyday words. Tone and icon come from the shared presentation (so colour is never the only
 * signal and the homepage badge is untouched); only the label differs. Detailed views also show the precise lifecycle.
 */
export function PlainStatusBadge({ status }: { status: ActionRequestStatus }) {
  const { tone, icon: Icon } = getActionRequestPresentation(status);
  return (
    <Badge tone={tone} className="px-3 py-1 text-[0.8125rem]">
      <Icon aria-hidden="true" />
      {PLAIN_STATUS[status].label}
    </Badge>
  );
}

export function PlainAgentStatusBadge({ status }: { status: AgentStatus }) {
  const Icon = status === "active" ? CheckCircle2 : ShieldX;
  return (
    <Badge
      tone={status === "active" ? "success" : "warning"}
      className="px-3 py-1 text-[0.8125rem]"
    >
      <Icon aria-hidden="true" />
      {PLAIN_AGENT_STATUS[status].label}
    </Badge>
  );
}
