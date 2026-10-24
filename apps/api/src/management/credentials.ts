import { recordAudit } from "../audit";
import { generateCredential } from "../credentials/keys";
import { conflict, invalid, notFound } from "../errors";
import { assertUuid, requireAdmin, type ManagementContext } from "./context";
import { cancelInFlightRequests } from "./cancel";

/**
 * Credential lifecycle: issue, rotate, revoke.
 *
 * The full key is returned ONCE, from the call that creates it, and exists nowhere else: the database stores only the
 * peppered digest and the public key id; the audit trail records the key id (a public handle), never the secret.
 *
 * Rotation issues the new credential and revokes the old one in the same transaction. A request that the old
 * credential originated and that is still waiting is withdrawn (decided in Q7); to avoid that, issue the new
 * credential, move the workflow over, and revoke the old one later with revokeCredential.
 */

export interface IssuedCredential {
  credentialId: string;
  keyId: string;
  /** Shown once. Never log, store or return it again. */
  fullKey: string;
}

async function lockAgent(context: ManagementContext, agentId: string): Promise<string> {
  const row = await context.tx.query<{ status: string }>(
    "SELECT status FROM axo.agents WHERE id = $1 FOR UPDATE",
    [agentId],
  );
  const status = row.rows[0]?.status;
  if (status === undefined) throw notFound("agent not found");
  return status;
}

async function issue(
  context: ManagementContext,
  pepper: Buffer,
  agentId: string,
  expiresAt: Date | undefined,
): Promise<IssuedCredential> {
  const generated = generateCredential(pepper);
  const inserted = await context.tx.query<{ id: string }>(
    `INSERT INTO axo.agent_credentials
       (organization_id, agent_id, key_id, secret_hash, hash_version, created_by_user_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      context.actor.organizationId,
      agentId,
      generated.keyId,
      generated.secretHash,
      generated.hashVersion,
      context.actor.userId,
      expiresAt ?? null,
    ],
  );
  const credentialId = inserted.rows[0]?.id;
  if (credentialId === undefined) throw new Error("credential insert returned no row");
  await recordAudit(context.tx, {
    organizationId: context.actor.organizationId,
    actorType: "user",
    actorId: context.actor.userId,
    eventType: "credential.issued",
    objectType: "credential",
    objectId: credentialId,
    metadata: { agent_id: agentId, key_id: generated.keyId, expires: expiresAt !== undefined },
  });
  return { credentialId, keyId: generated.keyId, fullKey: generated.fullKey };
}

export async function issueCredential(
  context: ManagementContext,
  pepper: Buffer,
  input: { agentId: string; expiresAt?: Date },
): Promise<IssuedCredential> {
  requireAdmin(context);
  assertUuid(input.agentId, "agent id");
  if (input.expiresAt !== undefined && input.expiresAt.getTime() <= Date.now()) {
    throw invalid("expiry must be in the future");
  }
  const status = await lockAgent(context, input.agentId);
  if (status === "revoked") throw conflict("agent is revoked");
  return issue(context, pepper, input.agentId, input.expiresAt);
}

export async function revokeCredential(
  context: ManagementContext,
  input: { credentialId: string; reason?: "manual" | "rotated" },
): Promise<{ cancelledRequests: number }> {
  requireAdmin(context);
  assertUuid(input.credentialId, "credential id");
  const updated = await context.tx.query<{ agent_id: string }>(
    `UPDATE axo.agent_credentials SET revoked_at = clock_timestamp(), revoked_reason = $2
      WHERE id = $1 AND revoked_at IS NULL RETURNING agent_id`,
    [input.credentialId, input.reason ?? "manual"],
  );
  const agentId = updated.rows[0]?.agent_id;
  if (agentId === undefined) {
    const known = await context.tx.query("SELECT 1 FROM axo.agent_credentials WHERE id = $1", [
      input.credentialId,
    ]);
    if (known.rowCount === 0) throw notFound("credential not found");
    throw conflict("credential is already revoked");
  }
  const cancelledRequests = await cancelInFlightRequests(
    context,
    { credentialId: input.credentialId },
    "CREDENTIAL_REVOKED",
    "credential_revoked",
  );
  await recordAudit(context.tx, {
    organizationId: context.actor.organizationId,
    actorType: "user",
    actorId: context.actor.userId,
    eventType: input.reason === "rotated" ? "credential.rotated_out" : "credential.revoked",
    objectType: "credential",
    objectId: input.credentialId,
    metadata: { agent_id: agentId, cancelled_requests: cancelledRequests },
  });
  return { cancelledRequests };
}

export async function rotateCredential(
  context: ManagementContext,
  pepper: Buffer,
  input: { agentId: string; credentialId: string; expiresAt?: Date },
): Promise<IssuedCredential & { cancelledRequests: number }> {
  requireAdmin(context);
  assertUuid(input.agentId, "agent id");
  assertUuid(input.credentialId, "credential id");
  const status = await lockAgent(context, input.agentId);
  if (status === "revoked") throw conflict("agent is revoked");
  const owner = await context.tx.query<{ agent_id: string }>(
    "SELECT agent_id FROM axo.agent_credentials WHERE id = $1",
    [input.credentialId],
  );
  if (owner.rows[0]?.agent_id !== input.agentId)
    throw notFound("credential not found for this agent");
  const issued = await issue(context, pepper, input.agentId, input.expiresAt);
  const { cancelledRequests } = await revokeCredential(context, {
    credentialId: input.credentialId,
    reason: "rotated",
  });
  return { ...issued, cancelledRequests };
}
