import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Clock,
  Hourglass,
  Loader2,
  ShieldCheck,
  ShieldX,
  TimerOff,
  type LucideIcon,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { ActionRequestStatus, AgentStatus } from "@/lib/contracts";

export interface StatusPresentation {
  label: string;
  tone: NonNullable<BadgeProps["tone"]>;
  icon: LucideIcon;
}

/**
 * Exhaustive over the contract: adding a status in lib/contracts fails type-checking until it is presented here.
 * Wording keeps "authorized" and "executed" distinct (CLAUDE.md: never conflate allowed and executed).
 */
const ACTION_REQUEST_PRESENTATION: Record<ActionRequestStatus, StatusPresentation> = {
  denied: { label: "Denied", tone: "danger", icon: ShieldX },
  pending_approval: { label: "Pending approval", tone: "warning", icon: Clock },
  approved: { label: "Approved · not yet executed", tone: "info", icon: ShieldCheck },
  queued_execution: { label: "Queued for execution", tone: "info", icon: Hourglass },
  running: { label: "Executing", tone: "info", icon: Loader2 },
  succeeded: { label: "Executed", tone: "success", icon: CheckCircle2 },
  failed: { label: "Execution failed", tone: "danger", icon: AlertTriangle },
  expired: { label: "Expired", tone: "neutral", icon: TimerOff },
  unknown: { label: "Outcome unknown", tone: "warning", icon: CircleHelp },
};

export function ActionRequestStatusBadge({ status }: { status: ActionRequestStatus }) {
  const { label, tone, icon: Icon } = ACTION_REQUEST_PRESENTATION[status];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  return status === "active" ? (
    <Badge tone="success">
      <CheckCircle2 aria-hidden="true" />
      Active
    </Badge>
  ) : (
    <Badge tone="warning">
      <ShieldX aria-hidden="true" />
      Suspended
    </Badge>
  );
}

/** Label + tone for a status, for views (charts, legends) that need the same wording as the badge. */
export function getActionRequestPresentation(status: ActionRequestStatus): StatusPresentation {
  return ACTION_REQUEST_PRESENTATION[status];
}
