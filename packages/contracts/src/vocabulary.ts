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
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
