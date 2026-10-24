import type pg from "pg";
import { computeActionDigest, isActionKey, validateActionRequest } from "@agentaxio/contracts";
import { evaluatePolicy } from "@agentaxio/policy";
import { RETENTION } from "../config";
import { decryptJson, parametersAad, type KeyRing } from "../crypto/data-keys";
import { loadCurrentPolicies } from "../authorization/policies";
import { inTransaction } from "../db/pool";
import type { Connector } from "./connectors";

/**
 * The trusted executor (docs/BE-02-DECISIONS.md D8). It runs as its own process under its own database role, which has
 * NO table privileges: everything it does goes through five database functions.
 *
 *   claim     ONE transaction: lock the next grant and everything it depends on (axo.claim_lock_next); decrypt the
 *             parameters and verify them against the approved digest; re-evaluate the CURRENT policy with the same pure
 *             evaluator the agent API uses; then axo.claim_finish either consumes the grant and starts an attempt, or
 *             invalidates the grant and closes the request with the reason. Agent, credential, environment, approval,
 *             expiry and digest are re-read inside the database under the locks.
 *   execute   AFTER the claim commits, outside any transaction, through a fixed connector, with a timeout.
 *   record    a second transaction writes the result: succeeded, failed or unknown.
 *
 * Nothing is retried. A grant is consumed by the claim, so it cannot be claimed again; an attempt that was started and
 * never recorded (a crash) is closed as UNKNOWN by the sweeper, not re-run.
 */

export interface ExecutorDeps {
  pool: pg.Pool;
  dataKeys: KeyRing;
  executorId: string;
  connector: Connector;
}

export type RunResult =
  | { kind: "idle" }
  | { kind: "blocked"; requestId: string; reasonCode: string }
  | {
      kind: "executed";
      requestId: string;
      outcome: "succeeded" | "failed" | "unknown";
      errorClass?: string;
    };

interface ClaimRow {
  grant_id: string;
  request_id: string;
  organization_id: string;
  agent_id: string;
  environment_id: string;
  action_key: string;
  resource: string;
  digest: string;
  ciphertext: Buffer | null;
  key_id: string | null;
  policy_epoch: string;
}

type Claim =
  | { kind: "none" }
  | { kind: "blocked"; requestId: string; reasonCode: string }
  | { kind: "claimed"; attemptId: string; requestId: string; parameters: Record<string, string> };

/** Decrypt and verify what is stored. Any problem means "the digest does not check out"; nothing partial is used. */
function verifiedParameters(keys: KeyRing, row: ClaimRow): Record<string, string> | null {
  if (row.ciphertext === null || row.key_id === null || !isActionKey(row.action_key)) return null;
  try {
    const decoded = decryptJson(
      keys,
      row.ciphertext,
      row.key_id,
      parametersAad(row.organization_id, row.request_id, row.digest),
    );
    const checked = validateActionRequest({
      action: row.action_key,
      resource: row.resource,
      parameters: decoded,
    });
    if (!checked.ok) return null;
    const digest = computeActionDigest({
      action: checked.request.action,
      resource: checked.request.resource,
      environmentId: row.environment_id,
      parameters: checked.request.parameters,
    });
    return digest === row.digest ? { ...checked.request.parameters } : null;
  } catch {
    return null;
  }
}

async function claim(deps: ExecutorDeps): Promise<Claim> {
  return inTransaction(deps.pool, async (tx): Promise<Claim> => {
    const locked = await tx.query<ClaimRow>("SELECT * FROM axo.claim_lock_next($1)", [
      deps.executorId,
    ]);
    const row = locked.rows[0];
    if (row === undefined) return { kind: "none" };

    const parameters = verifiedParameters(deps.dataKeys, row);
    let policyResult: "allow" | "require_approval" | "deny" | "error" = "error";
    if (parameters !== null) {
      const policies = await loadCurrentPolicies(tx, row.action_key);
      const decision = evaluatePolicy({
        principal: {
          organizationId: row.organization_id,
          agentId: row.agent_id,
          environmentId: row.environment_id,
        },
        action: row.action_key,
        parameters,
        policies,
        now: new Date(),
      });
      policyResult = decision.basis === "evaluator_error" ? "error" : decision.result;
    }

    const finished = await tx.query<{
      outcome: string;
      attempt_id: string | null;
      reason_code: string | null;
    }>("SELECT * FROM axo.claim_finish($1::uuid, $2, $3, $4::bigint, $5::boolean)", [
      row.grant_id,
      deps.executorId,
      policyResult,
      row.policy_epoch,
      parameters !== null,
    ]);
    const result = finished.rows[0];
    if (result === undefined || result.outcome === "gone") return { kind: "none" };
    if (result.outcome === "blocked" || result.attempt_id === null || parameters === null) {
      return {
        kind: "blocked",
        requestId: row.request_id,
        reasonCode: result.reason_code ?? "UNKNOWN",
      };
    }
    return { kind: "claimed", attemptId: result.attempt_id, requestId: row.request_id, parameters };
  });
}

/** Claim and run at most one action. Never throws for an outcome; throws only when the database is unavailable. */
export async function runOnce(deps: ExecutorDeps): Promise<RunResult> {
  const claimed = await claim(deps);
  if (claimed.kind === "none") return { kind: "idle" };
  if (claimed.kind === "blocked")
    return { kind: "blocked", requestId: claimed.requestId, reasonCode: claimed.reasonCode };

  let outcome: Awaited<ReturnType<Connector["execute"]>>;
  try {
    outcome = await deps.connector.execute({
      requestId: claimed.requestId,
      parameters: claimed.parameters,
    });
  } catch {
    // A connector fault after the claim: we cannot know what happened, so never claim "failed".
    outcome = { outcome: "unknown", errorClass: "connector_fault" };
  }
  await deps.pool.query("SELECT axo.record_execution_result($1::uuid, $2, $3, $4, $5)", [
    claimed.attemptId,
    deps.executorId,
    outcome.outcome,
    outcome.outcome === "succeeded" ? outcome.externalReference : null,
    outcome.outcome === "succeeded" ? null : outcome.errorClass,
  ]);
  return {
    kind: "executed",
    requestId: claimed.requestId,
    outcome: outcome.outcome,
    ...(outcome.outcome === "succeeded" ? {} : { errorClass: outcome.errorClass }),
  };
}

/** Housekeeping: expire what was never decided or claimed, close attempts lost to a crash, apply retention. */
export async function maintain(
  pool: pg.Pool,
): Promise<{ expired: number; lost: number; purged: number; cleaned: number }> {
  const one = async (sql: string, values: unknown[] = []): Promise<number> => {
    const r = await pool.query<{ n: number }>(sql, values);
    return r.rows[0]?.n ?? 0;
  };
  return {
    expired: await one("SELECT axo.expire_stale() AS n"),
    lost: await one("SELECT axo.sweep_stuck_attempts($1::integer) AS n", [
      RETENTION.stuckAttemptSeconds,
    ]),
    purged: await one("SELECT axo.purge_parameters($1::integer) AS n", [
      RETENTION.parametersDaysAfterFinal,
    ]),
    cleaned: await one("SELECT axo.cleanup_expired() AS n"),
  };
}
