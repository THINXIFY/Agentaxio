/**
 * The closed vocabularies shared by every AgentAxio component. Statuses follow docs/N8N-ENFORCEMENT.md, reason and
 * error codes follow docs/BE-01A-ARCHITECTURE-REVIEW.md section 8. Adding a value is a contract change: it needs a
 * review, a test update and an OpenAPI change.
 */

/** What an agent sees. `approved` is never "executed"; `unknown` means only "execution outcome uncertain". */
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

/** Policy outcomes. Precedence is deny > require_approval > allow > implicit deny. */
export const POLICY_EFFECTS = ["deny", "require_approval", "allow"] as const;
export type PolicyEffect = (typeof POLICY_EFFECTS)[number];

export const REASON_CODES = [
  "POLICY_DENY",
  "UNKNOWN_ACTION",
  "HUMAN_REVIEW_REQUIRED",
  "APPROVAL_DENIED",
  "APPROVAL_EXPIRED",
  "AGENT_SUSPENDED",
  "CREDENTIAL_REVOKED",
  "ENVIRONMENT_HALTED",
  "POLICY_CHANGED",
  "EVALUATOR_ERROR",
  "EXECUTION_FAILED",
  "OUTCOME_UNKNOWN",
  "DIGEST_MISMATCH",
  "GRANT_EXPIRED",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "AGENT_SUSPENDED",
  "NOT_FOUND",
  "IDEMPOTENCY_CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "INVALID_REQUEST",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "STEP_UP_REQUIRED",
  "CONFLICT",
  "EXPIRED",
] as const;

/** Human approval states (docs/BE-02-DECISIONS.md D7). Only `pending` can change; everything else is final. */
export const APPROVAL_STATES = ["pending", "approved", "rejected", "expired", "canceled"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

/** What recording a decision can answer. Only `approved` and `rejected` change anything. */
export const APPROVAL_OUTCOMES = [
  "approved",
  "rejected",
  "expired",
  "already_decided",
  "not_pending",
  "self_approval",
  "digest_mismatch",
] as const;
export type ApprovalOutcome = (typeof APPROVAL_OUTCOMES)[number];

export const EXECUTION_ATTEMPT_STATES = ["started", "succeeded", "failed", "unknown"] as const;
export type ExecutionAttemptState = (typeof EXECUTION_ATTEMPT_STATES)[number];
export type ErrorCode = (typeof ERROR_CODES)[number];
