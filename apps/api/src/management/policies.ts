import { validatePolicyForAction, POLICY_EFFECTS, type PolicyEffect } from "@agentaxio/contracts";
import { recordAudit } from "../audit";
import { invalid, notFound } from "../errors";
import { assertUuid, type ManagementContext } from "./context";

/**
 * Policy management. A policy header fixes what it governs and never changes; its behaviour is a sequence of
 * immutable, numbered versions. Editing (including disabling) means inserting the next version, and the caller must
 * state which version it believes is current (`expectedVersion`): if someone else got there first the insert is
 * refused instead of silently overwriting their change.
 *
 * Whether the caller may write at all is decided by the database (owner/admin only). Conditions are validated here
 * with the same code the evaluator uses, so a policy that could not be evaluated is never stored.
 */

export interface PolicyBody {
  effect: PolicyEffect;
  conditions: unknown;
  priority?: number;
  enabled?: boolean;
}

function checkBody(actionKey: string, body: PolicyBody): { priority: number; enabled: boolean } {
  if (!POLICY_EFFECTS.includes(body.effect)) throw invalid("unknown effect");
  const priority = body.priority ?? 0;
  if (!Number.isInteger(priority) || priority < 0 || priority > 1000)
    throw invalid("priority must be 0 to 1000");
  const checked = validatePolicyForAction(actionKey, body.conditions);
  if (!checked.ok) throw invalid(`invalid policy: ${checked.issues.join("; ")}`);
  return { priority, enabled: body.enabled ?? true };
}

async function insertVersion(
  context: ManagementContext,
  policyId: string,
  version: number,
  actionKey: string,
  body: PolicyBody,
): Promise<string> {
  const { priority, enabled } = checkBody(actionKey, body);
  const inserted = await context.tx.query<{ id: string }>(
    `INSERT INTO axo.policy_versions
       (organization_id, policy_id, version, effect, conditions, priority, enabled, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8) RETURNING id`,
    [
      context.actor.organizationId,
      policyId,
      version,
      body.effect,
      JSON.stringify(body.conditions),
      priority,
      enabled,
      context.actor.userId,
    ],
  );
  const versionId = inserted.rows[0]?.id;
  if (versionId === undefined) throw new Error("policy version insert returned no row");
  await recordAudit(context.tx, {
    organizationId: context.actor.organizationId,
    actorType: "user",
    actorId: context.actor.userId,
    eventType: "policy.version_created",
    objectType: "policy",
    objectId: policyId,
    metadata: { version, effect: body.effect, enabled, priority, action: actionKey },
  });
  return versionId;
}

export async function createPolicy(
  context: ManagementContext,
  input: PolicyBody & { actionKey: string; environmentId?: string; agentId?: string },
): Promise<{ policyId: string; versionId: string; version: 1 }> {
  if (input.environmentId !== undefined) assertUuid(input.environmentId, "environment id");
  if (input.agentId !== undefined) assertUuid(input.agentId, "agent id");
  checkBody(input.actionKey, input);
  const inserted = await context.tx.query<{ id: string }>(
    `INSERT INTO axo.policies (organization_id, action_key, environment_id, agent_id, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      context.actor.organizationId,
      input.actionKey,
      input.environmentId ?? null,
      input.agentId ?? null,
      context.actor.userId,
    ],
  );
  const policyId = inserted.rows[0]?.id;
  if (policyId === undefined) throw new Error("policy insert returned no row");
  await recordAudit(context.tx, {
    organizationId: context.actor.organizationId,
    actorType: "user",
    actorId: context.actor.userId,
    eventType: "policy.created",
    objectType: "policy",
    objectId: policyId,
    metadata: {
      action: input.actionKey,
      environment_id: input.environmentId ?? null,
      agent_id: input.agentId ?? null,
    },
  });
  const versionId = await insertVersion(context, policyId, 1, input.actionKey, input);
  return { policyId, versionId, version: 1 };
}

export async function createPolicyVersion(
  context: ManagementContext,
  input: PolicyBody & { policyId: string; expectedVersion: number },
): Promise<{ versionId: string; version: number }> {
  assertUuid(input.policyId, "policy id");
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw invalid("expectedVersion must be a positive integer");
  }
  const header = await context.tx.query<{ action_key: string }>(
    "SELECT action_key FROM axo.policies WHERE id = $1",
    [input.policyId],
  );
  const actionKey = header.rows[0]?.action_key;
  if (actionKey === undefined) throw notFound("policy not found");
  const version = input.expectedVersion + 1;
  const versionId = await insertVersion(context, input.policyId, version, actionKey, input);
  return { versionId, version };
}
