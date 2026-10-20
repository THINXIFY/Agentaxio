/**
 * MOCK DATA — frontend demonstration only.
 *
 * Everything in src/mocks is invented. No real organizations, people, agents, credentials or leads exist.
 * Emails use the reserved `.test` TLD. Any screen that renders these records MUST show the demo notice
 * (components/feedback/demo-notice.tsx). Mock records never imply that a control is enforced.
 *
 * Integration seam: the dashboard and homepage read data through the functions below. When the API exists
 * (M01+), replace these functions with typed fetchers returning the same shapes; pages need not change.
 */
import type {
  ActionKey,
  ActionRequestStatus,
  AgentStatus,
  EnvironmentName,
  KnownReasonCode,
} from "@/lib/contracts";

export interface MockAgent {
  id: string;
  name: string;
  description: string;
  environment: EnvironmentName;
  status: AgentStatus;
  owner: string;
  integration: string;
  lastRequestAt: string | null;
}

/** The strict `crm.lead.create` schema from docs/PHASE1-DECISIONS.md: exactly these keys, nothing else. */
export interface MockLeadParameters {
  full_name: string;
  email: string;
  company: string;
}

export interface MockActionRequest {
  id: string;
  agentId: string;
  agentName: string;
  environment: EnvironmentName;
  action: ActionKey;
  resource: string;
  parameters: MockLeadParameters;
  status: ActionRequestStatus;
  reasonCode: KnownReasonCode | null;
  /** Whether policy routed this request to a human reviewer. */
  reviewRequired: boolean;
  createdAt: string;
}

export const MOCK_DATA_NOTICE =
  "Sample data for interface review. Nothing on this screen is connected to a real agent, and no permission is enforced here.";

const agents: readonly MockAgent[] = [
  {
    id: "mock_agt_lead_intake",
    name: "Lead Intake Agent",
    description: "Proposes new CRM leads from inbound form submissions.",
    environment: "dev",
    status: "active",
    owner: "Demo Admin",
    integration: "n8n (demo workflow)",
    lastRequestAt: "2026-10-20T09:42:00Z",
  },
  {
    id: "mock_agt_inbound_qualifier",
    name: "Inbound Qualifier",
    description: "Enriches and proposes leads from chat conversations.",
    environment: "dev",
    status: "active",
    owner: "Demo Admin",
    integration: "n8n (demo workflow)",
    lastRequestAt: "2026-10-20T08:15:00Z",
  },
  {
    id: "mock_agt_legacy_import",
    name: "Legacy Import Agent",
    description: "Bulk import helper, suspended pending review.",
    environment: "staging",
    status: "suspended",
    owner: "Demo Owner",
    integration: "n8n (demo workflow)",
    lastRequestAt: "2026-10-17T14:03:00Z",
  },
];

const RESOURCE = "mockcrm/leads";

const actionRequests: readonly MockActionRequest[] = [
  {
    id: "mock_req_01HZ8A",
    agentId: "mock_agt_lead_intake",
    agentName: "Lead Intake Agent",
    environment: "dev",
    action: "crm.lead.create",
    resource: RESOURCE,
    parameters: { full_name: "Ada Example", email: "ada@example.test", company: "Sample Co" },
    status: "succeeded",
    reasonCode: null,
    reviewRequired: true,
    createdAt: "2026-10-20T09:42:00Z",
  },
  {
    id: "mock_req_01HZ8B",
    agentId: "mock_agt_inbound_qualifier",
    agentName: "Inbound Qualifier",
    environment: "dev",
    action: "crm.lead.create",
    resource: RESOURCE,
    parameters: { full_name: "Grace Sample", email: "grace@example.test", company: "Demo Labs" },
    status: "pending_approval",
    reasonCode: "HUMAN_REVIEW_REQUIRED",
    reviewRequired: true,
    createdAt: "2026-10-20T09:31:00Z",
  },
  {
    id: "mock_req_01HZ8C",
    agentId: "mock_agt_lead_intake",
    environment: "dev",
    agentName: "Lead Intake Agent",
    action: "crm.lead.create",
    resource: RESOURCE,
    parameters: {
      full_name: "Linus Placeholder",
      email: "linus@example.test",
      company: "Blocked Inc",
    },
    status: "denied",
    reasonCode: "POLICY_DENY",
    reviewRequired: false,
    createdAt: "2026-10-20T09:05:00Z",
  },
  {
    id: "mock_req_01HZ8D",
    agentId: "mock_agt_inbound_qualifier",
    agentName: "Inbound Qualifier",
    environment: "dev",
    action: "crm.lead.create",
    resource: RESOURCE,
    parameters: { full_name: "Alan Fixture", email: "alan@example.test", company: "Test Works" },
    status: "queued_execution",
    reasonCode: null,
    reviewRequired: false,
    createdAt: "2026-10-20T08:58:00Z",
  },
  {
    id: "mock_req_01HZ8E",
    agentId: "mock_agt_lead_intake",
    agentName: "Lead Intake Agent",
    environment: "dev",
    action: "crm.lead.create",
    resource: RESOURCE,
    parameters: {
      full_name: "Margaret Mock",
      email: "margaret@example.test",
      company: "Fake Foods",
    },
    status: "expired",
    reasonCode: "HUMAN_REVIEW_REQUIRED",
    reviewRequired: true,
    createdAt: "2026-10-20T07:40:00Z",
  },
  {
    id: "mock_req_01HZ8F",
    agentId: "mock_agt_legacy_import",
    agentName: "Legacy Import Agent",
    environment: "staging",
    action: "crm.lead.create",
    resource: RESOURCE,
    parameters: {
      full_name: "Dennis Dummy",
      email: "dennis@example.test",
      company: "Null Systems",
    },
    status: "unknown",
    reasonCode: null,
    reviewRequired: false,
    createdAt: "2026-10-17T14:03:00Z",
  },
];

export function listMockAgents(): readonly MockAgent[] {
  return agents;
}

export function listMockActionRequests(): readonly MockActionRequest[] {
  return actionRequests;
}

export function countByStatus(
  requests: readonly MockActionRequest[],
): Record<ActionRequestStatus, number> {
  const counts: Record<ActionRequestStatus, number> = {
    denied: 0,
    pending_approval: 0,
    approved: 0,
    queued_execution: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    expired: 0,
    unknown: 0,
  };
  for (const r of requests) counts[r.status] += 1;
  return counts;
}

export type TraceStepState = "done" | "current" | "waiting" | "skipped" | "stopped" | "uncertain";

export interface TraceStep {
  id: "identity" | "policy" | "review" | "executor" | "record";
  label: string;
  detail: string;
  state: TraceStepState;
}

/**
 * Illustrative decision trace for a mock request. This only RENDERS a story consistent with the request's
 * status; it performs no authorization. Real traces will come from the audit log (docs/DATABASE.md `audit_events`).
 */
export function traceFor(req: MockActionRequest): TraceStep[] {
  const identity: TraceStep = {
    id: "identity",
    label: "Agent identified",
    detail: "Derived from the scoped credential, not from the request body.",
    state: "done",
  };

  const policyDetail: Record<ActionRequestStatus, string> = {
    denied: "An explicit deny rule matched. Deny overrides allow and approval rules.",
    pending_approval: "Policy requires a human reviewer for this agent and action.",
    approved: "Policy requires a human reviewer; approval has been given.",
    queued_execution: "An allow rule matched; no human review is required.",
    running: "Policy allowed the request.",
    succeeded: "Policy required review for this action.",
    failed: "Policy allowed the request.",
    expired: "Policy required a human reviewer for this agent and action.",
    unknown: "An allow rule matched; no human review is required.",
  };
  const policy: TraceStep = {
    id: "policy",
    label: "Policy evaluated",
    detail: policyDetail[req.status],
    state: "done",
  };

  const reviewStep = (state: TraceStepState, detail: string): TraceStep => ({
    id: "review",
    label: "Human review",
    detail,
    state,
  });
  const executorStep = (state: TraceStepState, detail: string): TraceStep => ({
    id: "executor",
    label: "Trusted executor",
    detail,
    state,
  });
  const recordStep = (state: TraceStepState, detail: string): TraceStep => ({
    id: "record",
    label: "Outcome recorded",
    detail,
    state,
  });

  switch (req.status) {
    case "denied":
      return [
        identity,
        policy,
        reviewStep("skipped", "Not reached: the request was denied by policy."),
        executorStep("skipped", "Nothing was executed."),
        recordStep("done", "Decision recorded as denied."),
      ];
    case "pending_approval":
      return [
        identity,
        policy,
        reviewStep("current", "Waiting for an authorized approver. The requester cannot approve."),
        executorStep("waiting", "Runs only after approval, and revalidates policy first."),
        recordStep("waiting", "Written when the request resolves."),
      ];
    case "approved":
      return [
        identity,
        policy,
        reviewStep("done", "Approved on the exact parameters shown."),
        executorStep("waiting", "Approval is not execution. The executor still revalidates."),
        recordStep("waiting", "Written when execution finishes."),
      ];
    case "queued_execution":
      return [
        identity,
        policy,
        reviewStep("skipped", "Not required by policy."),
        executorStep("current", "Queued. Executes with a single-use internal grant."),
        recordStep("waiting", "Written when execution finishes."),
      ];
    case "running":
      return [
        identity,
        policy,
        reviewStep(
          req.reviewRequired ? "done" : "skipped",
          req.reviewRequired ? "Approved." : "Not required by policy.",
        ),
        executorStep("current", "Executing against the mock CRM."),
        recordStep("waiting", "Written when execution finishes."),
      ];
    case "succeeded":
      return [
        identity,
        policy,
        reviewStep("done", "Approved on the exact parameters shown."),
        executorStep("done", "Grant consumed once; mock lead created."),
        recordStep("done", "Authorization and execution recorded as separate events."),
      ];
    case "failed":
      return [
        identity,
        policy,
        reviewStep(
          req.reviewRequired ? "done" : "skipped",
          req.reviewRequired ? "Approved." : "Not required by policy.",
        ),
        executorStep("stopped", "Execution failed."),
        recordStep("done", "Failure recorded."),
      ];
    case "expired":
      return [
        identity,
        policy,
        reviewStep("stopped", "No decision before the deadline. Expired requests do not run."),
        executorStep("skipped", "Nothing was executed."),
        recordStep("done", "Expiry recorded."),
      ];
    case "unknown":
      return [
        identity,
        policy,
        reviewStep("skipped", "Not required by policy."),
        executorStep("uncertain", "Result not confirmed. Not retried automatically."),
        recordStep("done", "Recorded as unknown for manual follow-up."),
      ];
  }
}
