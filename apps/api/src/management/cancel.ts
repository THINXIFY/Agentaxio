import type { ReasonCode } from "@agentaxio/contracts";
import type { ManagementContext } from "./context";

/**
 * Withdraw every in-flight request (pending approval, approved or queued) of an agent or credential: each becomes
 * `denied`, with its own decision row and audit event, in the caller's transaction. Requests that are already
 * running or finished are untouched; an execution in flight cannot be recalled (docs/BE-01A 5.9).
 *
 * The column is chosen from a fixed pair, never from input.
 */
export async function cancelInFlightRequests(
  context: ManagementContext,
  by: { agentId: string } | { credentialId: string },
  reasonCode: ReasonCode,
  basis: "agent_suspended" | "credential_revoked",
): Promise<number> {
  const column = "agentId" in by ? "r.agent_id" : "r.originating_credential_id";
  const target = "agentId" in by ? by.agentId : by.credentialId;
  const result = await context.tx.query<{ cancelled: number }>(
    `WITH cancelled AS (
       UPDATE axo.action_requests r SET status = 'denied'
        WHERE r.organization_id = $1 AND ${column} = $2::uuid
          AND r.status IN ('pending_approval', 'approved', 'queued_execution')
       RETURNING r.id, r.environment_id
     ), decided AS (
       INSERT INTO axo.decisions (organization_id, action_request_id, result, reason_code, basis, policy_epoch)
       SELECT $1, c.id, 'deny', $4, $5, e.policy_epoch
         FROM cancelled c JOIN axo.environments e ON e.organization_id = $1 AND e.id = c.environment_id
       RETURNING 1
     ), audited AS (
       INSERT INTO axo.audit_events
         (organization_id, actor_type, actor_id, event_type, object_type, object_id, request_id, metadata)
       SELECT $1, 'user', $3::uuid, 'action_request.cancelled', 'action_request', c.id, c.id,
              jsonb_build_object('reason_code', $4::text)
         FROM cancelled c
       RETURNING 1
     )
     SELECT (SELECT count(*) FROM cancelled)::integer AS cancelled,
            (SELECT count(*) FROM decided) AS d, (SELECT count(*) FROM audited) AS a`,
    [context.actor.organizationId, target, context.actor.userId, reasonCode, basis],
  );
  return result.rows[0]?.cancelled ?? 0;
}
