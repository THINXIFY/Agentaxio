import type { ActionKey, ActionRequestStatus, AgentStatus, PolicyEffect } from "@/lib/contracts";

/**
 * Everyday wording for the dashboard. The API contracts and detailed audit views keep the precise terms (`crm.lead.create`,
 * `pending_approval`, "Authorization allowed"); everything an ordinary business user reads first goes through here.
 * Display only: nothing in this file decides, enforces or executes anything.
 */

const ACTION_LABELS: Record<ActionKey, { verb: string; short: string }> = {
  "crm.lead.create": { verb: "add a lead to the CRM", short: "Add a lead" },
};

/** "Add a lead", for headings and badges. Falls back to the technical key for an unmapped action. */
export function actionLabel(action: ActionKey): string {
  return ACTION_LABELS[action]?.short ?? action;
}

/** A sentence about what the agent wants to do, e.g. "add a lead to the CRM: Ada Lovelace at Analytical Engines". */
export function requestSentence(request: {
  action: ActionKey;
  parameters: { full_name: string; company: string };
}): string {
  const verb = ACTION_LABELS[request.action]?.verb ?? request.action;
  return `${verb}: ${request.parameters.full_name} at ${request.parameters.company}`;
}

export interface PlainStatus {
  label: string;
  /** One sentence for helper text and tooltips. Never says an approved action has run. */
  explanation: string;
}

/**
 * Plain labels for the contract statuses. "Approved" always says the action has not run yet: only `succeeded` says it
 * completed (CLAUDE.md: never conflate allowed and executed).
 */
export const PLAIN_STATUS: Record<ActionRequestStatus, PlainStatus> = {
  denied: {
    label: "Blocked",
    explanation: "A rule stopped this request, so the action did not happen.",
  },
  pending_approval: {
    label: "Needs approval",
    explanation: "A person has to say yes before this can go ahead.",
  },
  approved: {
    label: "Approved · not run yet",
    explanation:
      "A person said yes. Approval is permission, not proof that the action has happened.",
  },
  queued_execution: {
    label: "Waiting to run",
    explanation: "Allowed, and waiting for its turn. It has not happened yet.",
  },
  running: {
    label: "Running now",
    explanation: "Allowed and in progress. It has not finished yet.",
  },
  succeeded: {
    label: "Completed",
    explanation: "The action ran and finished successfully.",
  },
  failed: {
    label: "Didn’t complete",
    explanation: "It was allowed, but the action failed when it ran.",
  },
  expired: {
    label: "Expired",
    explanation: "Nobody approved this in time, so the action did not happen.",
  },
  unknown: {
    label: "Outcome unclear",
    explanation: "We can’t confirm whether the action happened. Check the tool directly.",
  },
};

export const PLAIN_EFFECT: Record<PolicyEffect, string> = {
  allow: "Allowed",
  require_approval: "Needs approval",
  deny: "Blocked",
};

export const PLAIN_AGENT_STATUS: Record<AgentStatus, PlainStatus> = {
  active: {
    label: "Active",
    explanation: "This agent can ask for permission to act.",
  },
  suspended: {
    label: "Suspended",
    explanation: "This agent is switched off. Every request it makes is blocked.",
  },
};

/** Short explanations for terms a first-time user may not know. Shown in small help popovers. */
export const GLOSSARY = {
  permissionCheck:
    "Before an agent does anything, AgentAxio checks your rules. The result is: allowed, needs approval, or blocked.",
  approval:
    "For some actions a person has to say yes first. Approval is permission to go ahead, not proof that the action has happened.",
  blocked:
    "Stopped by a rule. If no rule covers an action, it is blocked by default, so agents only do what you have allowed.",
  credential:
    "A private key that tells AgentAxio which agent is asking. Only a short, harmless preview is ever shown here.",
  result: "Whether the action actually ran. Only “Completed” means it did.",
} as const;
