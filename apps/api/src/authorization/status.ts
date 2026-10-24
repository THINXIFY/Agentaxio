import type pg from "pg";
import type { ActionRequestStatus, ReasonCode } from "@agentaxio/contracts";
import { inTransaction } from "../db/pool";
import { authenticateAgent } from "./authenticate";
import { REQUEST_SELECT } from "./submit";

export type StatusOutcome =
  | { kind: "found"; id: string; status: ActionRequestStatus; reasonCode: ReasonCode | null }
  | { kind: "not_found" }
  | { kind: "unauthenticated" }
  | { kind: "agent_suspended" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /v1/action-requests/:id for the authenticated agent only. Row-level security restricts the query to the agent's
 * own requests, so an id that belongs to another agent or organization is indistinguishable from one that does not
 * exist: both are `not_found` (S19). The response never includes parameters, approvers or execution internals.
 */
export async function getActionRequestStatus(
  pool: pg.Pool,
  pepper: Buffer,
  authorization: string | undefined,
  id: string,
): Promise<StatusOutcome> {
  return inTransaction(pool, async (tx): Promise<StatusOutcome> => {
    const auth = await authenticateAgent(tx, pepper, authorization, { write: false });
    if (auth.kind !== "ok") return { kind: auth.kind };
    if (!UUID.test(id)) return { kind: "not_found" };

    const found = await tx.query<{
      id: string;
      status: ActionRequestStatus;
      reason_code: ReasonCode | null;
    }>(`${REQUEST_SELECT} WHERE r.id = $1`, [id.toLowerCase()]);
    const row = found.rows[0];
    return row === undefined
      ? { kind: "not_found" }
      : { kind: "found", id: row.id, status: row.status, reasonCode: row.reason_code };
  });
}
