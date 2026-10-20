/**
 * MOCK DATA — dashboard dataset. Frontend demonstration only.
 *
 * Builds on the base mocks in ./index (which the marketing homepage uses and which must not change) and adds what the
 * dashboard needs: more agents, applications, approval reasons, per-agent permission rules and a lifecycle model.
 *
 * Everything here is invented: no real organizations, people, agents, credentials or leads exist. Emails use the reserved
 * `.test` TLD. Screens that render these records must carry the demo notice. Nothing here enforces or executes anything.
 * Replace the exported functions with typed API fetchers once the backend exists; pages need not change.
 */
import type { ActionKey, ActionRequestStatus, PolicyEffect } from "@/lib/contracts";
import {
  listMockActionRequests,
  listMockAgents,
  type MockActionRequest,
  type MockAgent,
} from "@/mocks";

/** "Now" for all sample timestamps, so relative times and the activity window are deterministic. */
export const MOCK_NOW = "2026-10-20T10:00:00Z";
export const MOCK_WINDOW_LABEL = "17–20 Oct 2026";

export interface AgentPermission {
  action: ActionKey;
  effect: PolicyEffect;
  /** Plain-language condition for the rule, e.g. "company is on the blocked list". */
  condition: string;
}

export interface DashboardAgent extends MockAgent {
  /** Visible, non-secret key prefix. Real secrets are shown once at creation and stored hashed. */
  credentialPrefix: string;
  permissions: AgentPermission[];
}

export interface DashboardRequest extends MockActionRequest {
  application: string;
  /** Why a human was (or would have been) involved, or why policy denied. */
  decisionReason: string;
  approvedBy: string | null;
}

const BASE_AGENT_EXTRAS: Record<
  string,
  Pick<DashboardAgent, "credentialPrefix" | "permissions">
> = {
  mock_agt_lead_intake: {
    credentialPrefix: "agx_dev_7Hk2…",
    permissions: [
      { action: "crm.lead.create", effect: "deny", condition: "company is on the blocked list" },
      { action: "crm.lead.create", effect: "require_approval", condition: "all other leads" },
    ],
  },
  mock_agt_inbound_qualifier: {
    credentialPrefix: "agx_dev_Qm4x…",
    permissions: [
      { action: "crm.lead.create", effect: "allow", condition: "company is on the approved list" },
      { action: "crm.lead.create", effect: "require_approval", condition: "all other leads" },
    ],
  },
  mock_agt_legacy_import: {
    credentialPrefix: "agx_stg_B9sd…",
    permissions: [{ action: "crm.lead.create", effect: "deny", condition: "agent is suspended" }],
  },
};

const EXTRA_AGENTS: readonly DashboardAgent[] = [
  {
    id: "mock_agt_event_registration",
    name: "Event Registration Agent",
    description: "Turns event sign-ups into CRM leads.",
    environment: "dev",
    status: "active",
    owner: "Demo Admin",
    integration: "n8n",
    lastRequestAt: null,
    credentialPrefix: "agx_dev_Ee3r…",
    permissions: [
      { action: "crm.lead.create", effect: "require_approval", condition: "all leads" },
    ],
  },
  {
    id: "mock_agt_partner_referral",
    name: "Partner Referral Agent",
    description: "Creates leads from partner referral forms.",
    environment: "dev",
    status: "active",
    owner: "Demo Owner",
    integration: "n8n",
    lastRequestAt: null,
    credentialPrefix: "agx_dev_Pr8w…",
    permissions: [
      { action: "crm.lead.create", effect: "allow", condition: "referral code is valid" },
    ],
  },
  {
    id: "mock_agt_webinar_followup",
    name: "Webinar Follow-up Agent",
    description: "Adds webinar attendees to the CRM.",
    environment: "staging",
    status: "active",
    owner: "Demo Owner",
    integration: "n8n",
    lastRequestAt: null,
    credentialPrefix: "agx_stg_Wf2k…",
    permissions: [
      { action: "crm.lead.create", effect: "require_approval", condition: "all leads" },
    ],
  },
  {
    id: "mock_agt_newsletter_signup",
    name: "Newsletter Signup Agent",
    description: "Logs newsletter subscribers as leads.",
    environment: "dev",
    status: "active",
    owner: "Demo Admin",
    integration: "n8n",
    lastRequestAt: null,
    credentialPrefix: "agx_dev_Ns6t…",
    permissions: [{ action: "crm.lead.create", effect: "allow", condition: "email is verified" }],
  },
  {
    id: "mock_agt_demo_request",
    name: "Demo Request Agent",
    description: "Suspended while its form is reworked.",
    environment: "staging",
    status: "suspended",
    owner: "Demo Admin",
    integration: "n8n",
    lastRequestAt: null,
    credentialPrefix: "agx_stg_Dr1v…",
    permissions: [{ action: "crm.lead.create", effect: "deny", condition: "agent is suspended" }],
  },
];

const BASE_REQUEST_EXTRAS: Record<
  string,
  Pick<DashboardRequest, "application" | "decisionReason" | "approvedBy">
> = {
  mock_req_01HZ8A: {
    application: "Mock CRM",
    decisionReason: "Policy requires human review for this agent.",
    approvedBy: "Demo Approver",
  },
  mock_req_01HZ8B: {
    application: "Mock CRM",
    decisionReason: "Company is not on the approved list, so review is required.",
    approvedBy: null,
  },
  mock_req_01HZ8C: {
    application: "Mock CRM",
    decisionReason: "A deny rule matched: company is on the blocked list.",
    approvedBy: null,
  },
  mock_req_01HZ8D: {
    application: "Mock CRM",
    decisionReason: "An allow rule matched: company is on the approved list.",
    approvedBy: null,
  },
  mock_req_01HZ8E: {
    application: "Mock CRM",
    decisionReason: "Policy requires human review for this agent.",
    approvedBy: null,
  },
  mock_req_01HZ8F: {
    application: "Mock CRM",
    decisionReason: "Allowed before the agent was suspended.",
    approvedBy: null,
  },
};

type Lead = MockActionRequest["parameters"];
const lead = (full_name: string, email: string, company: string): Lead => ({
  full_name,
  email,
  company,
});

function request(
  n: string,
  agentId: string,
  agentName: string,
  environment: MockActionRequest["environment"],
  status: ActionRequestStatus,
  createdAt: string,
  parameters: Lead,
  reviewRequired: boolean,
  decisionReason: string,
  approvedBy: string | null,
): DashboardRequest {
  return {
    id: `mock_req_01HZ8${n}`,
    agentId,
    agentName,
    environment,
    action: "crm.lead.create",
    resource: "mockcrm/leads",
    parameters,
    status,
    reasonCode:
      status === "denied"
        ? "POLICY_DENY"
        : status === "pending_approval" || status === "expired"
          ? "HUMAN_REVIEW_REQUIRED"
          : null,
    reviewRequired,
    createdAt,
    application: "Mock CRM",
    decisionReason,
    approvedBy,
  };
}

const EXTRA_REQUESTS: readonly DashboardRequest[] = [
  request(
    "G",
    "mock_agt_inbound_qualifier",
    "Inbound Qualifier",
    "dev",
    "approved",
    "2026-10-20T09:50:00Z",
    lead("Ken Thompson", "ken@example.test", "Unix Labs"),
    true,
    "Company is not on the approved list, so review was required.",
    "Demo Approver",
  ),
  request(
    "H",
    "mock_agt_partner_referral",
    "Partner Referral Agent",
    "dev",
    "running",
    "2026-10-20T09:57:00Z",
    lead("Barbara Liskov", "barbara@example.test", "Substitution Inc"),
    false,
    "An allow rule matched: referral code is valid.",
    null,
  ),
  request(
    "I",
    "mock_agt_event_registration",
    "Event Registration Agent",
    "dev",
    "pending_approval",
    "2026-10-20T09:48:00Z",
    lead("Edsger Sample", "edsger@example.test", "Dijkstra Demo"),
    true,
    "Policy requires human review for every event lead.",
    null,
  ),
  request(
    "J",
    "mock_agt_webinar_followup",
    "Webinar Follow-up Agent",
    "staging",
    "failed",
    "2026-10-19T16:20:00Z",
    lead("Hedy Placeholder", "hedy@example.test", "Spread Spectrum Co"),
    true,
    "Policy requires human review for every webinar lead.",
    "Demo Approver",
  ),
  request(
    "K",
    "mock_agt_partner_referral",
    "Partner Referral Agent",
    "dev",
    "succeeded",
    "2026-10-19T11:05:00Z",
    lead("Donald Fixture", "donald@example.test", "Literate Works"),
    false,
    "An allow rule matched: referral code is valid.",
    null,
  ),
  request(
    "L",
    "mock_agt_lead_intake",
    "Lead Intake Agent",
    "dev",
    "succeeded",
    "2026-10-18T15:30:00Z",
    lead("Radia Mock", "radia@example.test", "Spanning Tree Ltd"),
    true,
    "Policy requires human review for this agent.",
    "Demo Approver",
  ),
  request(
    "M",
    "mock_agt_demo_request",
    "Demo Request Agent",
    "staging",
    "denied",
    "2026-10-18T09:12:00Z",
    lead("Tim Dummy", "tim@example.test", "Hypertext Group"),
    false,
    "A deny rule matched: agent is suspended.",
    null,
  ),
  request(
    "N",
    "mock_agt_event_registration",
    "Event Registration Agent",
    "dev",
    "pending_approval",
    "2026-10-20T09:31:30Z",
    lead("Frances Sample", "frances@example.test", "Compiler Collective"),
    true,
    "Policy requires human review for every event lead.",
    null,
  ),
];

const byNewest = (a: { createdAt: string }, b: { createdAt: string }) =>
  b.createdAt.localeCompare(a.createdAt);

/** Agents for the dashboard, with `lastRequestAt` derived from the sample requests. */
export function listDashboardAgents(): readonly DashboardAgent[] {
  const requests = listDashboardRequests();
  const base = listMockAgents().map((a): DashboardAgent => ({ ...a, ...BASE_AGENT_EXTRAS[a.id]! }));
  return [...base, ...EXTRA_AGENTS].map((agent) => ({
    ...agent,
    lastRequestAt: requests.find((r) => r.agentId === agent.id)?.createdAt ?? null,
  }));
}

/** All sample requests, newest first. */
export function listDashboardRequests(): readonly DashboardRequest[] {
  const base = listMockActionRequests().map((r): DashboardRequest => ({
    ...r,
    ...BASE_REQUEST_EXTRAS[r.id]!,
  }));
  return [...base, ...EXTRA_REQUESTS].sort(byNewest);
}

/** One agent by id, or undefined. */
export function getDashboardAgent(id: string): DashboardAgent | undefined {
  return listDashboardAgents().find((a) => a.id === id);
}

/** Requests made by one agent, newest first. */
export function requestsForAgent(agentId: string): readonly DashboardRequest[] {
  return listDashboardRequests().filter((r) => r.agentId === agentId);
}

export function pendingApprovals(): readonly DashboardRequest[] {
  return listDashboardRequests().filter((r) => r.status === "pending_approval");
}

/** Requests that involve (or involved) a human reviewer, newest first. */
export function approvalCenterRequests(): readonly DashboardRequest[] {
  return listDashboardRequests().filter((r) => r.reviewRequired && r.status !== "denied");
}

export function countStatuses(
  requests: readonly DashboardRequest[],
): Record<ActionRequestStatus, number> {
  const counts = {
    denied: 0,
    pending_approval: 0,
    approved: 0,
    queued_execution: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    expired: 0,
    unknown: 0,
  } satisfies Record<ActionRequestStatus, number>;
  for (const r of requests) counts[r.status] += 1;
  return counts;
}

export interface DecisionBreakdown {
  /** Authorization allowed (directly, or after approval). Says nothing about whether the action ran. */
  allowed: number;
  /** Approval requested and still waiting. */
  pending: number;
  denied: number;
  /** Approval requested but not granted in time. */
  expired: number;
}

/** Policy decisions only; execution outcomes are a separate dimension (see lifecycleFor). */
export function decisionBreakdown(requests: readonly DashboardRequest[]): DecisionBreakdown {
  const out: DecisionBreakdown = { allowed: 0, pending: 0, denied: 0, expired: 0 };
  for (const r of requests) {
    switch (r.status) {
      case "denied":
        out.denied += 1;
        break;
      case "pending_approval":
        out.pending += 1;
        break;
      case "expired":
        out.expired += 1;
        break;
      default:
        out.allowed += 1;
    }
  }
  return out;
}

export interface DayCount {
  /** ISO date (YYYY-MM-DD, UTC). */
  date: string;
  label: string;
  count: number;
}

/** Request counts per UTC day over the sample window (inclusive), oldest first. */
export function activityByDay(
  requests: readonly DashboardRequest[],
  days = 4,
  now: string = MOCK_NOW,
): DayCount[] {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
  const out: DayCount[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(end.getTime() - i * 86_400_000);
    const date = d.toISOString().slice(0, 10);
    out.push({
      date,
      label: fmt.format(d),
      count: requests.filter((r) => r.createdAt.startsWith(date)).length,
    });
  }
  return out;
}

export interface DayOutcomes {
  /** ISO date (YYYY-MM-DD, UTC). */
  date: string;
  label: string;
  /** Authorization allowed (directly, or after approval). Says nothing about whether the action ran. */
  allowed: number;
  /** Approval requested: still waiting, or expired without a decision. */
  approval: number;
  blocked: number;
}

/** Sample requests per UTC day, split by how the permission check answered. Derived from the requests, never invented. */
export function outcomesByDay(
  requests: readonly DashboardRequest[],
  days = 4,
  now: string = MOCK_NOW,
): DayOutcomes[] {
  return activityByDay(requests, days, now).map((d) => {
    const day = requests.filter((r) => r.createdAt.startsWith(d.date));
    const count = (pick: (r: DashboardRequest) => boolean) => day.filter(pick).length;
    return {
      date: d.date,
      label: d.label,
      blocked: count((r) => r.status === "denied"),
      approval: count((r) => r.status === "pending_approval" || r.status === "expired"),
      allowed: count(
        (r) => r.status !== "denied" && r.status !== "pending_approval" && r.status !== "expired",
      ),
    };
  });
}

/**
 * Small illustrative trend lines for the summary cards. These are sample numbers only (there is no history in the mock
 * data); each ends on the figure its card shows so the two never disagree.
 */
export function sampleTrends(current: { agents: number; pending: number; blocked: number }) {
  return {
    agents: [
      current.agents - 1,
      current.agents - 1,
      current.agents,
      current.agents,
      current.agents,
      current.agents,
      current.agents,
    ],
    pending: [1, 2, 2, 4, 3, 2, current.pending],
    blocked: [1, 2, 0, 3, 1, 0, current.blocked],
  } as const;
}

export function formatAgo(iso: string, now: string = MOCK_NOW): string {
  const minutes = Math.max(
    0,
    Math.round((new Date(now).getTime() - new Date(iso).getTime()) / 60_000),
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

export type LifecycleState = "done" | "pending" | "stopped" | "na" | "uncertain";

export interface LifecycleStage {
  key: "authorization" | "approval" | "execution";
  title: string;
  /** Plain statement of this stage's outcome. */
  label: string;
  state: LifecycleState;
}

/**
 * The three separate facts about a request: was it AUTHORIZED, was it APPROVED by a human, did it EXECUTE.
 * Approval is never proof of execution: only a `succeeded` request has a completed execution stage.
 * Illustrative rendering of sample statuses; the real source of truth will be the audit log.
 */
export function lifecycleFor(
  req: Pick<DashboardRequest, "status" | "reviewRequired">,
): LifecycleStage[] {
  const stage = (
    key: LifecycleStage["key"],
    label: string,
    state: LifecycleState,
  ): LifecycleStage => ({
    key,
    title:
      key === "authorization" ? "Authorization" : key === "approval" ? "Approval" : "Execution",
    label,
    state,
  });
  const approvalDone = req.reviewRequired
    ? stage("approval", "Approval granted", "done")
    : stage("approval", "Approval not required", "na");
  const allowed = stage("authorization", "Authorization allowed", "done");

  switch (req.status) {
    case "denied":
      return [
        stage("authorization", "Authorization denied", "stopped"),
        stage("approval", "Approval not requested", "na"),
        stage("execution", "Not executed", "na"),
      ];
    case "pending_approval":
      return [
        stage("authorization", "Approval requested", "pending"),
        stage("approval", "Awaiting reviewer", "pending"),
        stage("execution", "Not started", "na"),
      ];
    case "approved":
      return [
        allowed,
        stage("approval", "Approval granted", "done"),
        stage("execution", "Execution pending", "pending"),
      ];
    case "queued_execution":
      return [
        allowed,
        stage("approval", "Approval not required", "na"),
        stage("execution", "Execution pending", "pending"),
      ];
    case "running":
      return [allowed, approvalDone, stage("execution", "Executing now", "pending")];
    case "succeeded":
      return [allowed, approvalDone, stage("execution", "Execution completed", "done")];
    case "failed":
      return [allowed, approvalDone, stage("execution", "Execution failed", "stopped")];
    case "expired":
      return [
        stage("authorization", "Approval requested", "done"),
        stage("approval", "Approval expired", "stopped"),
        stage("execution", "Not executed", "na"),
      ];
    case "unknown":
      return [allowed, approvalDone, stage("execution", "Outcome unknown", "uncertain")];
  }
}

export interface DashboardIntegration {
  id: string;
  name: string;
  description: string;
  /** Roadmap position. Nothing here is available or connected in the pre-release. */
  stage: "first-planned" | "planned" | "future";
  stageLabel: string;
}

/** Integration roadmap, mirroring docs/N8N-ENFORCEMENT.md and docs/PHASE1-DECISIONS.md. Never "connected". */
export function listIntegrations(): readonly DashboardIntegration[] {
  return [
    {
      id: "n8n",
      name: "n8n",
      description:
        "First planned enforcement point. Workflows call AgentAxio with the built-in HTTP Request node and a scoped key.",
      stage: "first-planned",
      stageLabel: "Planned · first integration",
    },
    {
      id: "typescript-sdk",
      name: "TypeScript SDK",
      description:
        "For developers who call AgentAxio from their own code. Planned after the n8n demo is proven end to end.",
      stage: "planned",
      stageLabel: "Planned",
    },
    {
      id: "additional",
      name: "Additional integrations",
      description: "MCP tool gateways and other platforms, later on the roadmap.",
      stage: "future",
      stageLabel: "Planned",
    },
  ];
}
