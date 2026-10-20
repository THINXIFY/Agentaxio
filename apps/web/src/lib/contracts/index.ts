/**
 * Frontend mirror of the locked Phase 1 vocabulary.
 *
 * SOURCES (authoritative, do not diverge): docs/N8N-ENFORCEMENT.md, docs/PHASE1-DECISIONS.md, docs/DATABASE.md.
 * These constants exist so UI components are typed against the real status/role/effect names today.
 * When M01 creates `packages/contracts`, replace this module with imports from that package and delete it.
 * Nothing here enforces anything: the UI is a view over server decisions, never the decision-maker.
 */

/** GET /v1/action-requests/:id status values (docs/N8N-ENFORCEMENT.md step 7). */
export const ACTION_REQUEST_STATUSES = [
  "denied",
  "pending_approval",
  "approved",
  "queued_execution",
  "running",
  "succeeded",
  "failed",
  "expired",
  "unknown",
] as const;
export type ActionRequestStatus = (typeof ACTION_REQUEST_STATUSES)[number];

/** Policy effects; precedence is deny > require_approval > allow > implicit_deny (docs/PHASE1-DECISIONS.md). */
export const POLICY_EFFECTS = ["deny", "require_approval", "allow"] as const;
export type PolicyEffect = (typeof POLICY_EFFECTS)[number];

/** Reason codes named in docs/N8N-ENFORCEMENT.md. The M01 contracts package will extend this list. */
export const REASON_CODES = ["POLICY_DENY", "HUMAN_REVIEW_REQUIRED"] as const;
export type KnownReasonCode = (typeof REASON_CODES)[number];

/** Organization membership roles (docs/PRD.md). Role labels in the UI confer no rights; the server decides. */
export const MEMBERSHIP_ROLES = ["owner", "admin", "approver", "viewer"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const ENVIRONMENTS = ["dev", "staging", "prod"] as const;
export type EnvironmentName = (typeof ENVIRONMENTS)[number];

export const AGENT_STATUSES = ["active", "suspended"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

/** The only action in the locked Phase 1 demonstration (mock CRM only). */
export const ACTION_KEYS = ["crm.lead.create"] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];
