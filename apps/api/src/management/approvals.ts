import type { ApprovalOutcome, ApprovalState } from "@agentaxio/contracts";
import { decryptJson, KeyError, parametersAad, type KeyRing } from "../crypto/data-keys";
import { invalid, notFound } from "../errors";
import { assertUuid, requireStepUp, type ManagementContext } from "./context";

/**
 * The human approval workflow, from the reviewer's side (docs/BE-02-DECISIONS.md D5-D7).
 *
 * Listing shows metadata only. Reading one approval for review is the only place a person receives the submitted
 * values: the database releases the ciphertext to owners, admins and approvers only, and it is decrypted here with the
 * row-bound key. Deciding is a single database call that checks the role, a fresh MFA, expiry, the reviewed digest and
 * the self-approval rule under row locks. Approval is permission, not execution.
 */

export interface ApprovalSummary {
  id: string;
  requestId: string;
  state: ApprovalState;
  agentId: string;
  agentName: string;
  environment: string;
  action: string;
  resource: string;
  requestStatus: string;
  createdAt: string;
  expiresAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
}

interface SummaryRow {
  id: string;
  request_id: string;
  state: ApprovalState;
  agent_id: string;
  agent_name: string;
  environment: string;
  action_key: string;
  resource: string;
  request_status: string;
  created_at: Date;
  expires_at: Date;
  decided_by_user_id: string | null;
  decided_at: Date | null;
}

const toSummary = (r: SummaryRow): ApprovalSummary => ({
  id: r.id,
  requestId: r.request_id,
  // A pending approval past its deadline is expired whether or not a sweeper has marked it yet.
  state: r.state === "pending" && r.expires_at.getTime() <= Date.now() ? "expired" : r.state,
  agentId: r.agent_id,
  agentName: r.agent_name,
  environment: r.environment,
  action: r.action_key,
  resource: r.resource,
  requestStatus: r.request_status,
  createdAt: r.created_at.toISOString(),
  expiresAt: r.expires_at.toISOString(),
  decidedBy: r.decided_by_user_id,
  decidedAt: r.decided_at?.toISOString() ?? null,
});

export async function listApprovals(
  context: ManagementContext,
  filter: { state?: ApprovalState | "all"; limit?: number } = {},
): Promise<ApprovalSummary[]> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const result = await context.tx.query<SummaryRow>(
    `SELECT a.id, r.id AS request_id, a.state, ag.id AS agent_id, ag.name AS agent_name, e.name AS environment,
            r.action_key, r.resource, r.status AS request_status, a.created_at, a.expires_at,
            a.decided_by_user_id, a.decided_at
       FROM axo.approval_requests a
       JOIN axo.action_requests r ON r.organization_id = a.organization_id AND r.id = a.action_request_id
       JOIN axo.agents ag ON ag.organization_id = r.organization_id AND ag.id = r.agent_id
       JOIN axo.environments e ON e.organization_id = r.organization_id AND e.id = r.environment_id
      WHERE ($1::text IS NULL OR $1 = 'all' OR a.state = $1)
      ORDER BY (a.state = 'pending') DESC, a.created_at DESC
      LIMIT $2`,
    [filter.state ?? null, limit],
  );
  return result.rows.map(toSummary);
}

export interface ApprovalReview extends ApprovalSummary {
  digest: string;
  /** The exact values the agent submitted, or null if retention has erased them. */
  parameters: Record<string, string> | null;
  parametersErased: boolean;
  /** True when the organization's policies changed after this request was evaluated. The executor re-checks anyway. */
  policyChangedSinceRequest: boolean;
  decisionComment: string | null;
}

export async function reviewApproval(
  context: ManagementContext,
  keys: KeyRing,
  input: { approvalId: string },
): Promise<ApprovalReview> {
  assertUuid(input.approvalId, "approval id");
  const result = await context.tx.query<{
    approval_id: string;
    state: ApprovalState;
    approval_created_at: Date;
    approval_expires_at: Date;
    request_id: string;
    request_status: string;
    agent_id: string;
    agent_name: string;
    environment_name: string;
    action_key: string;
    resource: string;
    digest: string;
    ciphertext: Buffer | null;
    key_id: string | null;
    policy_epoch: string;
    current_policy_epoch: string;
    decided_by: string | null;
    decided_at: Date | null;
    decision_comment: string | null;
    purged: boolean;
  }>("SELECT * FROM axo.review_approval($1::uuid)", [input.approvalId]);
  const row = result.rows[0];
  if (row === undefined) throw notFound("approval not found");

  let parameters: Record<string, string> | null = null;
  if (row.ciphertext !== null && row.key_id !== null) {
    try {
      const decoded = decryptJson(
        keys,
        row.ciphertext,
        row.key_id,
        parametersAad(context.actor.organizationId, row.request_id, row.digest),
      );
      if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
        throw new KeyError("unexpected parameter shape");
      }
      parameters = Object.fromEntries(Object.entries(decoded).map(([k, v]) => [k, String(v)]));
    } catch {
      // Never show partial or unverifiable data to a reviewer: they must not approve what they cannot trust.
      throw invalid("the stored parameters could not be verified");
    }
  }
  return {
    ...toSummary({
      id: row.approval_id,
      request_id: row.request_id,
      state: row.state,
      agent_id: row.agent_id,
      agent_name: row.agent_name,
      environment: row.environment_name,
      action_key: row.action_key,
      resource: row.resource,
      request_status: row.request_status,
      created_at: row.approval_created_at,
      expires_at: row.approval_expires_at,
      decided_by_user_id: row.decided_by,
      decided_at: row.decided_at,
    }),
    digest: row.digest,
    parameters,
    parametersErased: row.purged,
    policyChangedSinceRequest: row.policy_epoch !== row.current_policy_epoch,
    decisionComment: row.decision_comment,
  };
}

export interface DecisionResult {
  outcome: ApprovalOutcome;
  requestStatus: string;
}

/**
 * Records the reviewer's decision. `reviewedDigest` is the digest the reviewer was shown; the database refuses the
 * decision if it is not the stored one. Returns the outcome instead of throwing for the cases that must leave an audit
 * record (self-approval, digest mismatch, expiry): the caller turns them into an HTTP answer AFTER the commit.
 */
export async function decideApproval(
  context: ManagementContext,
  input: {
    approvalId: string;
    decision: "approve" | "reject";
    reviewedDigest: string;
    comment?: string;
  },
): Promise<DecisionResult> {
  assertUuid(input.approvalId, "approval id");
  requireStepUp(context);
  const result = await context.tx.query<{ outcome: ApprovalOutcome; request_status: string }>(
    "SELECT outcome, request_status FROM axo.decide_approval($1::uuid, $2, $3, $4)",
    [input.approvalId, input.decision, input.reviewedDigest, input.comment ?? null],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("decision returned no row");
  return { outcome: row.outcome, requestStatus: row.request_status };
}
