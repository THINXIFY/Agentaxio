import type { LifecycleStage } from "@/mocks/dashboard";
import { ACTION_REQUEST_STATUSES, type ActionRequestStatus } from "@/lib/contracts";

/**
 * Display helpers for live records. They only turn server answers into everyday words; none of them decides, enforces or
 * executes anything.
 */

/** A status string from the API, narrowed to the known vocabulary. Anything unrecognised is shown as "outcome unclear". */
export function toRequestStatus(value: string): ActionRequestStatus {
  return (ACTION_REQUEST_STATUSES as readonly string[]).includes(value)
    ? (value as ActionRequestStatus)
    : "unknown";
}

const ACTION_VERBS: Record<string, string> = {
  "crm.lead.create": "add a lead to the CRM",
};

/** "add a lead to the CRM". Falls back to the technical key for an action this screen does not know. */
export function actionVerb(action: string): string {
  return ACTION_VERBS[action] ?? action;
}

export const RESOURCE_LABELS: Record<string, string> = {
  "mockcrm/leads": "Mock CRM (a demonstration system, not a real CRM)",
};

export function relativeTime(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} h ago`;
  return `${String(Math.floor(hours / 24))} d ago`;
}

/** Time left until an instant, e.g. "12 min left", or "expired". */
export function timeLeft(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  if (seconds <= 0) return "expired";
  if (seconds < 90) return "under a minute left";
  return `${String(Math.round(seconds / 60))} min left`;
}

const REASONS: Record<string, string> = {
  POLICY_DENY: "A rule blocked this request.",
  UNKNOWN_ACTION: "AgentAxio does not know this kind of action, so it was blocked.",
  HUMAN_REVIEW_REQUIRED: "A rule says a person has to approve this first.",
  APPROVAL_DENIED: "A person said no.",
  APPROVAL_EXPIRED: "Nobody approved it in time.",
  AGENT_SUSPENDED: "The agent was switched off.",
  CREDENTIAL_REVOKED: "The agent’s key was revoked.",
  ENVIRONMENT_HALTED: "Everything in this environment was stopped.",
  POLICY_CHANGED: "The rules changed after this was approved, so it was stopped before running.",
  EVALUATOR_ERROR: "The rules could not be checked safely, so it was stopped.",
  EXECUTION_FAILED: "The tool refused or could not do it.",
  OUTCOME_UNKNOWN: "AgentAxio can’t confirm whether it happened. Check the tool directly.",
  DIGEST_MISMATCH: "The details no longer matched what was approved, so it was stopped.",
  GRANT_EXPIRED: "The permission ran out before the action could start.",
};

export function reasonText(code: string | null): string | null {
  if (code === null) return null;
  return REASONS[code] ?? "Stopped for a reason this screen does not describe.";
}

const EVENT_LABELS: Record<string, string> = {
  "action_request.created": "Request received",
  "decision.recorded": "Permission check answered",
  "approval.requested": "Approval requested",
  "approval.approved": "Approved by a person",
  "approval.rejected": "Rejected by a person",
  "approval.expired": "Approval expired",
  "approval.self_approval_blocked": "Self-approval blocked",
  "approval.digest_mismatch": "Decision refused: details had changed",
  "action_request.queued": "Waiting to run",
  "action_request.cancelled": "Withdrawn",
  "grant.claimed": "Permission used by the executor",
  "grant.expired": "Permission expired unused",
  "execution.started": "Execution started",
  "execution.succeeded": "Execution completed",
  "execution.failed": "Execution failed",
  "execution.unknown": "Execution outcome unclear",
  "execution.blocked": "Stopped just before running",
  "action_request.parameters_purged": "Submitted details erased (retention)",
};

export function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? event.replace(/[._]/g, " ");
}

/** The rule's conditions in words. Only the fixed grammar is described; anything else is shown as custom. */
export function conditionsText(conditions: unknown): string {
  if (typeof conditions !== "object" || conditions === null || !("all" in conditions))
    return "custom conditions";
  const all = (conditions as { all: unknown }).all;
  if (!Array.isArray(all)) return "custom conditions";
  if (all.length === 0) return "every request";
  const parts = all.map((c: unknown) => {
    if (typeof c !== "object" || c === null) return "a condition";
    const { field, op, value } = c as { field?: unknown; op?: unknown; value?: unknown };
    const list = Array.isArray(value) ? value.join(", ") : String(value);
    const name = typeof field === "string" ? field.replace(/_/g, " ") : "a field";
    switch (op) {
      case "eq":
        return `${name} is ${list}`;
      case "neq":
        return `${name} is not ${list}`;
      case "in":
        return `${name} is one of ${list}`;
      case "not_in":
        return `${name} is none of ${list}`;
      case "email_domain_in":
        return `${name} is at ${list}`;
      default:
        return "a condition";
    }
  });
  return parts.join(" and ");
}

/** What a person did with a request's approval, if there was one. */
export type ApprovalFact = "pending" | "approved" | "rejected" | "expired" | "canceled" | undefined;

/**
 * The three separate facts about a real request: was it AUTHORIZED, was it APPROVED by a person, did it EXECUTE. Built from
 * the request's status plus its approval, so a request that was approved and then stopped shows exactly that. Approval is
 * never shown as proof that anything ran: only `succeeded` has a completed execution stage.
 */
export function liveLifecycle(
  status: ActionRequestStatus,
  approval: ApprovalFact,
): LifecycleStage[] {
  const stage = (
    key: LifecycleStage["key"],
    label: string,
    state: LifecycleStage["state"],
  ): LifecycleStage => ({
    key,
    title:
      key === "authorization" ? "Authorization" : key === "approval" ? "Approval" : "Execution",
    label,
    state,
  });
  const authDone = stage("authorization", "Authorization allowed", "done");
  const approvalStage =
    approval === "approved"
      ? stage("approval", "Approval granted", "done")
      : stage("approval", "Approval not required", "na");
  const notRun = stage("execution", "Not executed", "na");

  switch (status) {
    case "denied":
      if (approval === "rejected")
        return [
          stage("authorization", "Approval requested", "done"),
          stage("approval", "Rejected by a person", "stopped"),
          notRun,
        ];
      if (approval === "canceled")
        return [
          stage("authorization", "Withdrawn", "stopped"),
          stage("approval", "Approval canceled", "stopped"),
          notRun,
        ];
      if (approval === "approved")
        return [
          authDone,
          stage("approval", "Approval granted", "done"),
          stage("execution", "Stopped before running", "stopped"),
        ];
      return [
        stage("authorization", "Authorization denied", "stopped"),
        stage("approval", "Approval not requested", "na"),
        notRun,
      ];
    case "pending_approval":
      return [
        stage("authorization", "Approval requested", "pending"),
        stage("approval", "Awaiting reviewer", "pending"),
        stage("execution", "Not started", "na"),
      ];
    case "expired":
      return approval === "approved"
        ? [
            authDone,
            stage("approval", "Approval granted", "done"),
            stage("execution", "Permission expired unused", "stopped"),
          ]
        : approval === undefined
          ? [authDone, approvalStage, stage("execution", "Permission expired unused", "stopped")]
          : [
              stage("authorization", "Approval requested", "done"),
              stage("approval", "Approval expired", "stopped"),
              notRun,
            ];
    case "approved":
    case "queued_execution":
      return [authDone, approvalStage, stage("execution", "Waiting to run", "pending")];
    case "running":
      return [authDone, approvalStage, stage("execution", "Executing now", "pending")];
    case "succeeded":
      return [authDone, approvalStage, stage("execution", "Execution completed", "done")];
    case "failed":
      return [authDone, approvalStage, stage("execution", "Execution failed", "stopped")];
    case "unknown":
      return [authDone, approvalStage, stage("execution", "Outcome unknown", "uncertain")];
  }
}
