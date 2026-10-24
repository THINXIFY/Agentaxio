import type pg from "pg";
import { forbidden, invalid, translateDbError } from "../errors";
import { inTransaction, type Tx } from "../db/pool";

/**
 * Management operations (agents, credentials, policies) run as the `axo_management` database role inside a
 * transaction whose tenant is established by the DATABASE: axo.enter_management_context proves that `userId` is an
 * active member of `organizationId`, and every statement is then additionally gated by row-level security that checks
 * the member's role (viewers read, owners and admins write).
 *
 * `userId` must come from an authenticated human session. M01 has no human login (identity provider undecided, open
 * decision Q3), so in M01 the callers are the seed script and tests; M02 supplies the verified session. Nothing in this
 * module trusts a role claimed by the caller: the role is read from the memberships table.
 */

export interface ManagementActor {
  userId: string;
  organizationId: string;
}

export interface ManagementContext {
  tx: Tx;
  actor: ManagementActor;
  /** The actor's membership role, as read from the database. For information; permissions are enforced by the database. */
  role: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, what: string): void {
  if (!UUID.test(value)) throw invalid(`${what} must be a UUID`);
}

export async function withManagement<T>(
  pool: pg.Pool,
  actor: ManagementActor,
  work: (context: ManagementContext) => Promise<T>,
): Promise<T> {
  assertUuid(actor.userId, "user id");
  assertUuid(actor.organizationId, "organization id");
  try {
    return await inTransaction(pool, async (tx) => {
      const entered = await tx.query<{ role: string }>(
        "SELECT axo.enter_management_context($1::uuid, $2::uuid) AS role",
        [actor.userId, actor.organizationId],
      );
      const role = entered.rows[0]?.role;
      if (role === undefined) throw new Error("management context returned no role");
      return await work({ tx, actor, role });
    });
  } catch (error) {
    throw translateDbError(error);
  }
}

/**
 * Writes need the owner or admin role. The database enforces this independently (row-level security on every write);
 * this check exists so a viewer or approver gets a clear "forbidden" instead of a misleading "not found" or
 * "conflict" from a statement that row-level security silently filtered to zero rows. The role is the one the database
 * read from the memberships table when the context was entered, never a value supplied by the caller.
 */
export function requireAdmin(context: ManagementContext): void {
  if (context.role !== "owner" && context.role !== "admin") throw forbidden();
}
