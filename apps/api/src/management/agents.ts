import { recordAudit } from "../audit";
import { conflict, invalid, notFound } from "../errors";
import { assertUuid, requireAdmin, type ManagementContext } from "./context";
import { cancelInFlightRequests } from "./cancel";

/**
 * Agent identity lifecycle: register, suspend, resume, revoke.
 *   suspended: reversible. The agent's keys stay valid but every request is refused (403), in-flight requests are
 *              withdrawn, and resuming never revives them.
 *   revoked:   permanent. All credentials are revoked as well.
 * Permissions (owner/admin only) are enforced by the database; these functions never check a role themselves.
 */

const audit = (context: ManagementContext, eventType: string, agentId: string, metadata = {}) =>
  recordAudit(context.tx, {
    organizationId: context.actor.organizationId,
    actorType: "user",
    actorId: context.actor.userId,
    eventType,
    objectType: "agent",
    objectId: agentId,
    metadata,
  });

export async function registerAgent(
  context: ManagementContext,
  input: { environmentId: string; ownerUserId: string; name: string; description?: string },
): Promise<{ agentId: string }> {
  requireAdmin(context);
  assertUuid(input.environmentId, "environment id");
  assertUuid(input.ownerUserId, "owner user id");
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) throw invalid("name must be 1 to 80 characters");
  if (input.description !== undefined && input.description.length > 500) {
    throw invalid("description must be at most 500 characters");
  }
  const inserted = await context.tx.query<{ id: string }>(
    `INSERT INTO axo.agents (organization_id, environment_id, owner_user_id, name, description, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      context.actor.organizationId,
      input.environmentId,
      input.ownerUserId,
      name,
      input.description ?? null,
      context.actor.userId,
    ],
  );
  const agentId = inserted.rows[0]?.id;
  if (agentId === undefined) throw new Error("agent insert returned no row");
  await audit(context, "agent.registered", agentId, {
    environment_id: input.environmentId,
    owner_user_id: input.ownerUserId,
  });
  return { agentId };
}

async function currentStatus(context: ManagementContext, agentId: string): Promise<string> {
  const row = await context.tx.query<{ status: string }>(
    "SELECT status FROM axo.agents WHERE id = $1",
    [agentId],
  );
  const status = row.rows[0]?.status;
  if (status === undefined) throw notFound("agent not found");
  return status;
}

export async function suspendAgent(
  context: ManagementContext,
  input: { agentId: string },
): Promise<{ cancelledRequests: number }> {
  requireAdmin(context);
  assertUuid(input.agentId, "agent id");
  const updated = await context.tx.query(
    "UPDATE axo.agents SET status = 'suspended', suspended_at = clock_timestamp() WHERE id = $1 AND status = 'active'",
    [input.agentId],
  );
  if (updated.rowCount === 0) {
    const status = await currentStatus(context, input.agentId);
    throw conflict(`agent is ${status}, not active`);
  }
  const cancelledRequests = await cancelInFlightRequests(
    context,
    { agentId: input.agentId },
    "AGENT_SUSPENDED",
    "agent_suspended",
  );
  await audit(context, "agent.suspended", input.agentId, { cancelled_requests: cancelledRequests });
  return { cancelledRequests };
}

export async function resumeAgent(
  context: ManagementContext,
  input: { agentId: string },
): Promise<void> {
  requireAdmin(context);
  assertUuid(input.agentId, "agent id");
  const updated = await context.tx.query(
    "UPDATE axo.agents SET status = 'active', suspended_at = NULL WHERE id = $1 AND status = 'suspended'",
    [input.agentId],
  );
  if (updated.rowCount === 0) {
    const status = await currentStatus(context, input.agentId);
    throw conflict(`agent is ${status}, not suspended`);
  }
  await audit(context, "agent.resumed", input.agentId);
}

export async function revokeAgent(
  context: ManagementContext,
  input: { agentId: string },
): Promise<{ cancelledRequests: number; revokedCredentials: number }> {
  requireAdmin(context);
  assertUuid(input.agentId, "agent id");
  const updated = await context.tx.query(
    "UPDATE axo.agents SET status = 'revoked', revoked_at = clock_timestamp() WHERE id = $1 AND status <> 'revoked'",
    [input.agentId],
  );
  if (updated.rowCount === 0) {
    await currentStatus(context, input.agentId);
    throw conflict("agent is already revoked");
  }
  const credentials = await context.tx.query(
    `UPDATE axo.agent_credentials SET revoked_at = clock_timestamp(), revoked_reason = 'agent_revoked'
      WHERE agent_id = $1 AND revoked_at IS NULL`,
    [input.agentId],
  );
  const cancelledRequests = await cancelInFlightRequests(
    context,
    { agentId: input.agentId },
    "AGENT_SUSPENDED",
    "agent_suspended",
  );
  const revokedCredentials = credentials.rowCount ?? 0;
  await audit(context, "agent.revoked", input.agentId, {
    cancelled_requests: cancelledRequests,
    revoked_credentials: revokedCredentials,
  });
  return { cancelledRequests, revokedCredentials };
}
