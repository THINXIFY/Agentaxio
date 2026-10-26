import type { ReasonCode } from "@agentaxio/contracts";
import type { ManagementContext } from "./context";

/**
 * Withdraw every in-flight request (pending approval, approved or queued) of an agent or credential. One database
 * function does all of it in the caller's transaction: each request becomes `denied` with its own decision row and
 * audit event, its pending approval is cancelled, and its unused grant is invalidated. Requests that are already
 * running or finished are untouched; an execution in flight cannot be recalled.
 */
export async function cancelInFlightRequests(
  context: ManagementContext,
  by: { agentId: string } | { credentialId: string },
  reasonCode: ReasonCode,
  basis: "agent_suspended" | "credential_revoked",
): Promise<number> {
  const result = await context.tx.query<{ cancelled: number }>(
    "SELECT axo.withdraw_requests($1::uuid, $2::uuid, $3, $4) AS cancelled",
    [
      "agentId" in by ? by.agentId : null,
      "credentialId" in by ? by.credentialId : null,
      reasonCode,
      basis,
    ],
  );
  return result.rows[0]?.cancelled ?? 0;
}
