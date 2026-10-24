import { randomUUID } from "node:crypto";
import type pg from "pg";
import {
  IdempotencyKeySchema,
  computeActionDigest,
  validateActionRequest,
  type ActionRequestStatus,
  type ActionRequestValidation,
  type ReasonCode,
} from "@agentaxio/contracts";
import { evaluatePolicy } from "@agentaxio/policy";
import { LIMITS } from "../config";
import { encryptJson, parametersAad, type KeyRing } from "../crypto/data-keys";
import { RATE_LIMITS, rateLimitHit } from "../ratelimit";
import { inTransaction, type Tx } from "../db/pool";
import { recordAudit } from "../audit";
import { authenticateAgent, verifyAgentSecret, type AgentContext } from "./authenticate";
import { loadCurrentPolicies } from "./policies";

/**
 * POST /v1/action-requests, as a function of (credential, idempotency key, body).
 *
 * One transaction does everything: authenticate and lock (axo.enter_agent_context), check idempotency, load the
 * current policies, evaluate, write the request, the decision and the audit events. It commits or leaves no trace
 * (apart from an audit event for a rejected-invalid request). Nothing is executed here: the request ends at
 * "queued_execution" (authorized, waiting for the trusted executor) or "pending_approval" (waiting for a person).
 *
 * The agent row is locked FOR UPDATE for the whole transaction, so requests from one agent are serialized. That makes
 * idempotency and the pending cap exact, and makes "suspend the agent" wait for in-flight decisions instead of racing
 * them. The cost is per-agent throughput, which is acceptable for V1.
 */

export interface SubmitInput {
  authorization: string | undefined;
  idempotencyKey: string | undefined;
  body: unknown;
  traceId: string;
}

export interface DecidedOutcome {
  kind: "decided";
  /** 403 for a denial, 202 otherwise. A replay returns the same codes as the original. */
  httpStatus: 202 | 403;
  id: string;
  status: ActionRequestStatus;
  reasonCode: ReasonCode | null;
  replay: boolean;
}

export type SubmitOutcome =
  | DecidedOutcome
  | { kind: "unauthenticated" }
  | { kind: "agent_suspended" }
  | { kind: "invalid"; issues: readonly string[] }
  | { kind: "idempotency_conflict" }
  | { kind: "rate_limited"; retryAfterSeconds: number };

interface RequestRow {
  id: string;
  status: ActionRequestStatus;
  canonical_digest: string;
  reason_code: ReasonCode | null;
}

/**
 * Status with expiry applied, so correctness never depends on a background sweeper having run: a pending request
 * past its approval deadline, and a queued request whose unclaimed grant has lapsed, both read as expired.
 */
const EFFECTIVE_STATUS = `CASE
  WHEN r.status = 'pending_approval' AND r.expires_at <= clock_timestamp() THEN 'expired'
  WHEN r.status = 'queued_execution' AND g.consumed_at IS NULL AND g.expires_at <= clock_timestamp() THEN 'expired'
  ELSE r.status END`;

/**
 * The reason code an agent may see. Only states that are explained by a reason carry one: a request that went on to
 * succeed does not keep reporting "human review required".
 */
export const REQUEST_SELECT = `
  SELECT r.id, ${EFFECTIVE_STATUS} AS status, r.canonical_digest,
         CASE ${EFFECTIVE_STATUS}
           WHEN 'expired' THEN CASE WHEN r.status = 'pending_approval' THEN 'APPROVAL_EXPIRED' ELSE 'GRANT_EXPIRED' END
           WHEN 'failed' THEN 'EXECUTION_FAILED'
           WHEN 'unknown' THEN 'OUTCOME_UNKNOWN'
           WHEN 'denied' THEN d.reason_code
           WHEN 'pending_approval' THEN d.reason_code
           ELSE NULL END AS reason_code
    FROM axo.action_requests r
    LEFT JOIN axo.execution_grants g ON g.action_request_id = r.id AND g.organization_id = r.organization_id
    LEFT JOIN LATERAL (SELECT x.reason_code FROM axo.decisions x WHERE x.action_request_id = r.id
                        ORDER BY x.decided_at DESC, x.id DESC LIMIT 1) d ON true`;

const toOutcome = (row: RequestRow, replay: boolean): DecidedOutcome => ({
  kind: "decided",
  httpStatus: row.status === "denied" ? 403 : 202,
  id: row.id,
  status: row.status,
  reasonCode: row.reason_code,
  replay,
});

async function findByKey(
  tx: Tx,
  agentId: string,
  requestKey: string,
): Promise<RequestRow | undefined> {
  const found = await tx.query<RequestRow>(
    `${REQUEST_SELECT} WHERE r.agent_id = $1 AND r.request_key = $2`,
    [agentId, requestKey],
  );
  return found.rows[0];
}

function invalidIssues(keyIssues: boolean, validation: ActionRequestValidation): string[] {
  const issues: string[] = [];
  if (keyIssues) issues.push("idempotency-key: invalid");
  if (!validation.ok && validation.kind === "invalid") issues.push(...validation.issues);
  return issues.slice(0, 20);
}

interface Decision {
  result: "deny" | "require_approval" | "allow";
  reasonCode: ReasonCode | null;
  basis: string;
  policyVersionId: string | null;
  matched: readonly string[];
}

async function decide(
  tx: Tx,
  ctx: AgentContext,
  requested: { action: string; parameters: Readonly<Record<string, string>> },
  known: boolean,
): Promise<Decision> {
  if (!known) {
    return {
      result: "deny",
      reasonCode: "UNKNOWN_ACTION",
      basis: "unknown_action",
      policyVersionId: null,
      matched: [],
    };
  }
  if (ctx.environmentState === "halted") {
    return {
      result: "deny",
      reasonCode: "ENVIRONMENT_HALTED",
      basis: "environment_halted",
      policyVersionId: null,
      matched: [],
    };
  }
  const policies = await loadCurrentPolicies(tx, requested.action);
  const decision = evaluatePolicy({
    principal: {
      organizationId: ctx.organizationId,
      agentId: ctx.agentId,
      environmentId: ctx.environmentId,
    },
    action: requested.action,
    parameters: requested.parameters,
    policies,
    now: new Date(),
  });
  return {
    result: decision.result,
    reasonCode: decision.reasonCode,
    basis: decision.basis,
    policyVersionId: decision.policyVersionId,
    matched: decision.matchedPolicyVersionIds,
  };
}

export interface AgentDeps {
  pepper: Buffer;
  dataKeys: KeyRing;
}

export async function submitActionRequest(
  pool: pg.Pool,
  deps: AgentDeps,
  input: SubmitInput,
): Promise<SubmitOutcome> {
  // Before any lock is taken: prove the secret, then spend one unit of this agent's allowance in its own transaction (so
  // a request that is later refused or rolled back still counts). A caller without the secret never touches the limit.
  const known = await verifyAgentSecret(pool, deps.pepper, input.authorization);
  if (known.kind !== "ok") return { kind: "unauthenticated" };
  const allowance = await rateLimitHit(pool, RATE_LIMITS.agentRequests, known.agentId);
  if (!allowance.allowed)
    return { kind: "rate_limited", retryAfterSeconds: allowance.retryAfterSeconds };

  return inTransaction(pool, async (tx): Promise<SubmitOutcome> => {
    const auth = await authenticateAgent(tx, deps.pepper, input.authorization, { write: true });
    if (auth.kind !== "ok") return { kind: auth.kind };
    const ctx = auth.context;
    const actor = {
      organizationId: ctx.organizationId,
      actorType: "agent",
      actorId: ctx.agentId,
    } as const;

    const key = IdempotencyKeySchema.safeParse(input.idempotencyKey);
    const validation = validateActionRequest(input.body);
    if (!key.success || (!validation.ok && validation.kind === "invalid")) {
      const issues = invalidIssues(!key.success, validation);
      await recordAudit(tx, {
        ...actor,
        eventType: "action_request.rejected_invalid",
        objectType: "action_request",
        traceId: input.traceId,
        metadata: { issues },
      });
      return { kind: "invalid", issues };
    }

    const requested = validation.ok
      ? validation.request
      : { action: validation.action, resource: "", parameters: {} as Record<string, string> };
    const digest = computeActionDigest({
      action: requested.action,
      resource: requested.resource,
      environmentId: ctx.environmentId,
      parameters: requested.parameters,
    });

    // Idempotency: the same key from the same agent is the same request. A different payload under it is a conflict.
    const earlier = await findByKey(tx, ctx.agentId, key.data);
    if (earlier !== undefined) {
      return earlier.canonical_digest === digest
        ? toOutcome(earlier, true)
        : { kind: "idempotency_conflict" };
    }

    const decision = await decide(tx, ctx, requested, validation.ok);
    if (
      decision.result === "require_approval" &&
      ctx.pendingRequests >= LIMITS.maxPendingPerAgent
    ) {
      return { kind: "rate_limited", retryAfterSeconds: 30 };
    }

    const initialStatus: ActionRequestStatus =
      decision.result === "deny"
        ? "denied"
        : decision.result === "require_approval"
          ? "pending_approval"
          : "approved";
    const ttl = initialStatus === "approved" ? LIMITS.queueTtlSeconds : LIMITS.approvalTtlSeconds;
    // The parameters are encrypted here, bound to this row (organization, request id, digest); the database only ever
    // stores the ciphertext.
    const requestId = randomUUID();
    const sealed = encryptJson(
      deps.dataKeys,
      requested.parameters,
      parametersAad(ctx.organizationId, requestId, digest),
    );
    const inserted = await tx.query<{ id: string; expires_at: Date }>(
      `INSERT INTO axo.action_requests
         (id, organization_id, agent_id, environment_id, action_key, resource, request_key, canonical_digest,
          parameters_ciphertext, parameters_key_id, status, originating_credential_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, clock_timestamp() + make_interval(secs => $13))
       ON CONFLICT (organization_id, agent_id, request_key) DO NOTHING
       RETURNING id, expires_at`,
      [
        requestId,
        ctx.organizationId,
        ctx.agentId,
        ctx.environmentId,
        requested.action,
        requested.resource,
        key.data,
        digest,
        sealed.ciphertext,
        sealed.keyId,
        initialStatus,
        ctx.credentialId,
        ttl,
      ],
    );
    const created = inserted.rows[0];
    if (created === undefined) {
      // Backstop for the unique constraint: another transaction created it between our check and our insert.
      const raced = await findByKey(tx, ctx.agentId, key.data);
      if (raced === undefined) throw new Error("idempotency conflict without a row");
      return raced.canonical_digest === digest
        ? toOutcome(raced, true)
        : { kind: "idempotency_conflict" };
    }

    await tx.query(
      `INSERT INTO axo.decisions
         (organization_id, action_request_id, result, reason_code, basis, policy_version_id, policy_epoch,
          matched_policy_version_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::uuid[])`,
      [
        ctx.organizationId,
        created.id,
        decision.result,
        decision.reasonCode,
        decision.basis,
        decision.policyVersionId,
        ctx.policyEpoch,
        decision.matched,
      ],
    );
    if (initialStatus === "pending_approval") {
      // The person who will decide sees this in their queue. It expires with the request.
      await tx.query(
        `INSERT INTO axo.approval_requests
           (organization_id, action_request_id, requested_digest, policy_version_id, policy_epoch, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          ctx.organizationId,
          created.id,
          digest,
          decision.policyVersionId,
          ctx.policyEpoch,
          created.expires_at,
        ],
      );
      await recordAudit(tx, {
        ...actor,
        eventType: "approval.requested",
        objectType: "action_request",
        objectId: created.id,
        requestId: created.id,
        traceId: input.traceId,
        metadata: { digest, policy_epoch: ctx.policyEpoch },
      });
    }
    await recordAudit(tx, {
      ...actor,
      eventType: "action_request.created",
      objectType: "action_request",
      objectId: created.id,
      requestId: created.id,
      traceId: input.traceId,
      metadata: {
        action: requested.action,
        digest,
        fields: Object.keys(requested.parameters).sort(),
        status: initialStatus,
      },
    });
    await recordAudit(tx, {
      ...actor,
      eventType: "decision.recorded",
      objectType: "action_request",
      objectId: created.id,
      requestId: created.id,
      traceId: input.traceId,
      metadata: {
        result: decision.result,
        reason_code: decision.reasonCode,
        basis: decision.basis,
        policy_version_id: decision.policyVersionId,
        matched_policy_versions: [...decision.matched],
        policy_epoch: ctx.policyEpoch,
      },
    });

    let finalStatus: ActionRequestStatus = initialStatus;
    if (initialStatus === "approved") {
      // Direct allow: authorized by policy, now queued for the (M02) executor. Authorized is not executed.
      await tx.query("UPDATE axo.action_requests SET status = 'queued_execution' WHERE id = $1", [
        created.id,
      ]);
      finalStatus = "queued_execution";
      await recordAudit(tx, {
        ...actor,
        eventType: "action_request.queued",
        objectType: "action_request",
        objectId: created.id,
        requestId: created.id,
        traceId: input.traceId,
        metadata: { status: finalStatus },
      });
    }

    return {
      kind: "decided",
      httpStatus: finalStatus === "denied" ? 403 : 202,
      id: created.id,
      status: finalStatus,
      reasonCode:
        finalStatus === "denied" || finalStatus === "pending_approval" ? decision.reasonCode : null,
      replay: false,
    };
  });
}
