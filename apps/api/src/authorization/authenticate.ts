import type pg from "pg";
import type { Tx } from "../db/pool";
import {
  bearerFromHeader,
  burnVerification,
  parseCredential,
  verifySecret,
} from "../credentials/keys";

/**
 * Agent authentication inside an open transaction.
 *
 *   1. Parse the bearer credential; look up (credential id, digest) by its public key id.
 *   2. Verify the secret in constant time.
 *   3. Only then call axo.enter_agent_context, which derives organization, agent and environment from the database,
 *      takes the locks, and sets the row-level-security context.
 *
 * Every way of failing to authenticate (no header, malformed key, unknown key id, wrong secret, revoked, expired,
 * revoked agent) yields the same result, `unauthenticated`, so the response reveals nothing. A suspended agent that
 * proved possession of a valid key is told so (`agent_suspended`), because it is entitled to know.
 */

export interface AgentContext {
  organizationId: string;
  agentId: string;
  environmentId: string;
  credentialId: string;
  environmentState: "active" | "halted";
  policyEpoch: number;
  pendingRequests: number;
}

export type AuthResult =
  { kind: "ok"; context: AgentContext } | { kind: "unauthenticated" } | { kind: "agent_suspended" };

interface ContextRow {
  organization_id: string;
  agent_id: string;
  environment_id: string;
  agent_status: "active" | "suspended" | "revoked";
  environment_state: "active" | "halted";
  policy_epoch: string;
  credential_state: "usable" | "revoked" | "expired";
  pending_requests: number;
}

export async function authenticateAgent(
  tx: Tx,
  pepper: Buffer,
  authorizationHeader: string | undefined,
  options: { write: boolean },
): Promise<AuthResult> {
  const presented = bearerFromHeader(authorizationHeader);
  const parsed = presented === null ? null : parseCredential(presented);
  if (parsed === null) {
    burnVerification(pepper, presented ?? "");
    return { kind: "unauthenticated" };
  }

  const found = await tx.query<{ credential_id: string; secret_hash: Buffer }>(
    "SELECT credential_id, secret_hash FROM axo.lookup_credential($1)",
    [parsed.keyId],
  );
  const row = found.rows[0];
  if (row === undefined) {
    burnVerification(pepper, parsed.secret);
    return { kind: "unauthenticated" };
  }
  if (!verifySecret(pepper, parsed.secret, row.secret_hash)) return { kind: "unauthenticated" };

  const entered = await tx.query<ContextRow>(
    "SELECT * FROM axo.enter_agent_context($1::uuid, $2::boolean)",
    [row.credential_id, options.write],
  );
  const ctx = entered.rows[0];
  if (ctx === undefined) return { kind: "unauthenticated" };

  if (ctx.credential_state !== "usable" || ctx.agent_status === "revoked") {
    return { kind: "unauthenticated" };
  }
  if (ctx.agent_status === "suspended") return { kind: "agent_suspended" };

  return {
    kind: "ok",
    context: {
      organizationId: ctx.organization_id,
      agentId: ctx.agent_id,
      environmentId: ctx.environment_id,
      credentialId: row.credential_id,
      environmentState: ctx.environment_state,
      policyEpoch: Number(ctx.policy_epoch),
      pendingRequests: ctx.pending_requests,
    },
  };
}

/**
 * Verify the key's secret with a single short query, holding no locks and no transaction, and say which agent it
 * belongs to. The agent API uses this to apply a per-agent rate limit BEFORE it opens the locking transaction: a
 * request must never hold one pooled connection while waiting for another. The authoritative check (revoked, expired,
 * suspended, halted) is still made inside the transaction, under locks, by authenticateAgent.
 */
export async function verifyAgentSecret(
  pool: pg.Pool,
  pepper: Buffer,
  authorizationHeader: string | undefined,
): Promise<{ kind: "ok"; agentId: string } | { kind: "unauthenticated" }> {
  const presented = bearerFromHeader(authorizationHeader);
  const parsed = presented === null ? null : parseCredential(presented);
  if (parsed === null) {
    burnVerification(pepper, presented ?? "");
    return { kind: "unauthenticated" };
  }
  const found = await pool.query<{ agent_id: string; secret_hash: Buffer }>(
    "SELECT agent_id, secret_hash FROM axo.lookup_credential($1)",
    [parsed.keyId],
  );
  const row = found.rows[0];
  if (row === undefined) {
    burnVerification(pepper, parsed.secret);
    return { kind: "unauthenticated" };
  }
  return verifySecret(pepper, parsed.secret, row.secret_hash)
    ? { kind: "ok", agentId: row.agent_id }
    : { kind: "unauthenticated" };
}
