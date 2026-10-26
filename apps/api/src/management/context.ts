import type pg from "pg";
import { SESSION } from "../config";
import { hashToken, isWellFormedToken, tokensEqual } from "../auth/tokens";
import {
  DomainError,
  forbidden,
  invalid,
  stepUpRequired,
  translateDbError,
  unauthenticated,
} from "../errors";
import { inTransaction, type Tx } from "../db/pool";

/**
 * Everything a signed-in person does runs inside a transaction whose identity comes from the DATABASE:
 *
 *   axo.enter_session(token hash)  -> proves the session is live and sets the user id and MFA freshness from its row;
 *   axo.enter_org(organization)    -> proves that user is an active member, and sets the organization and role.
 *
 * No user id, role or MFA claim is ever taken from a client. The organization id in a URL is only a request to enter
 * it; the database accepts it only for a member. Statements are then gated again by row-level security and by the
 * database functions' own role checks.
 */

export interface ManagementActor {
  userId: string;
  organizationId: string;
}

export interface SessionContext {
  tx: Tx;
  userId: string;
  sessionId: string;
  /** True when this session performed multi-factor authentication within the last 15 minutes. */
  mfaFresh: boolean;
}

export interface ManagementContext extends SessionContext {
  actor: ManagementActor;
  /** The actor's membership role as read from the database. Permissions are enforced by the database as well. */
  role: string;
}

export interface SessionOptions {
  /** The raw session cookie value. */
  sessionToken: string | undefined;
  /** Set for state-changing requests: the raw X-CSRF-Token header value. It must match the session's token. */
  csrfToken?: string | undefined;
  /** Whether this request changes state (and so must carry a valid CSRF token). */
  mutating?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, what: string): void {
  if (!UUID.test(value)) throw invalid(`${what} must be a UUID`);
}

async function enterSession(tx: Tx, options: SessionOptions): Promise<SessionContext> {
  if (!isWellFormedToken(options.sessionToken)) throw unauthenticated();
  let entered;
  try {
    entered = await tx.query<{
      user_id: string;
      session_id: string;
      mfa_fresh: boolean;
      csrf_hash: Buffer;
    }>("SELECT * FROM axo.enter_session($1::bytea, $2::integer)", [
      hashToken(options.sessionToken),
      SESSION.idleSeconds,
    ]);
  } catch (error) {
    // The database refuses an unknown, expired, revoked or disabled session with insufficient_privilege.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "42501") {
      throw unauthenticated();
    }
    throw error;
  }
  const row = entered.rows[0];
  if (row === undefined) throw unauthenticated();
  if (options.mutating === true && !tokensEqual(options.csrfToken, row.csrf_hash)) {
    throw forbidden("CSRF token missing or wrong");
  }
  return { tx, userId: row.user_id, sessionId: row.session_id, mfaFresh: row.mfa_fresh };
}

/** Work that needs a signed-in user but no organization yet: who am I, create an organization, accept an invitation. */
export async function withSession<T>(
  pool: pg.Pool,
  options: SessionOptions,
  work: (context: SessionContext) => Promise<T>,
): Promise<T> {
  try {
    return await inTransaction(pool, async (tx) => work(await enterSession(tx, options)));
  } catch (error) {
    throw translateDbError(error);
  }
}

export async function withManagement<T>(
  pool: pg.Pool,
  options: SessionOptions & { organizationId: string },
  work: (context: ManagementContext) => Promise<T>,
): Promise<T> {
  assertUuid(options.organizationId, "organization id");
  try {
    return await inTransaction(pool, async (tx) => {
      const session = await enterSession(tx, options);
      const entered = await tx.query<{ role: string }>("SELECT axo.enter_org($1::uuid) AS role", [
        options.organizationId,
      ]);
      const role = entered.rows[0]?.role;
      if (role === undefined) throw new Error("organization context returned no role");
      return await work({
        ...session,
        actor: { userId: session.userId, organizationId: options.organizationId },
        role,
      });
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

/** Sensitive actions need a recent multi-factor authentication (docs/BE-02-DECISIONS.md D4); the database checks it too. */
export function requireStepUp(context: SessionContext): void {
  if (!context.mfaFresh) throw stepUpRequired();
}

export { DomainError };
