import { recordAudit } from "../audit";
import { conflict, notFound } from "../errors";
import { assertUuid, type ManagementContext } from "./context";

/**
 * Emergency stop. A halted environment denies every new request from its agents (reason ENVIRONMENT_HALTED) while
 * leaving everything else intact; resuming lifts it. Owners and admins only (enforced by the database).
 */
async function setState(
  context: ManagementContext,
  environmentId: string,
  from: "active" | "halted",
  to: "active" | "halted",
  eventType: string,
): Promise<void> {
  assertUuid(environmentId, "environment id");
  const updated = await context.tx.query(
    "UPDATE axo.environments SET enforcement_state = $3 WHERE id = $1 AND enforcement_state = $2",
    [environmentId, from, to],
  );
  if (updated.rowCount === 0) {
    const known = await context.tx.query("SELECT 1 FROM axo.environments WHERE id = $1", [
      environmentId,
    ]);
    if (known.rowCount === 0) throw notFound("environment not found");
    throw conflict(`environment is already ${to}`);
  }
  await recordAudit(context.tx, {
    organizationId: context.actor.organizationId,
    actorType: "user",
    actorId: context.actor.userId,
    eventType,
    objectType: "environment",
    objectId: environmentId,
  });
}

export const haltEnvironment = (context: ManagementContext, input: { environmentId: string }) =>
  setState(context, input.environmentId, "active", "halted", "environment.halted");

export const resumeEnvironment = (context: ManagementContext, input: { environmentId: string }) =>
  setState(context, input.environmentId, "halted", "active", "environment.resumed");
