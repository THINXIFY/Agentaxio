import { newToken } from "../auth/tokens";

/**
 * Tenant provisioning: organizations, users, memberships and environments.
 *
 * These are OWNER-ONLY operations. No runtime role may create an organization or a membership, because doing so in M01
 * would require inventing a sign-up and invitation flow and a human identity provider (open decision Q3). Until M02
 * adds them, they are performed by an operator (the seed script, tests) connected as axo_migrator.
 */

export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

async function insertOne(db: Queryable, text: string, values: unknown[]): Promise<string> {
  const result = await db.query(text, values);
  const id = result.rows[0]?.id;
  if (typeof id !== "string") throw new Error("insert returned no id");
  return id;
}

export function provisionOrganization(
  db: Queryable,
  input: { name: string; slug: string },
): Promise<string> {
  return insertOne(db, "INSERT INTO axo.organizations (name, slug) VALUES ($1, $2) RETURNING id", [
    input.name,
    input.slug,
  ]);
}

export function provisionUser(
  db: Queryable,
  input: { issuer: string; subject: string; email?: string },
): Promise<string> {
  return insertOne(
    db,
    "INSERT INTO axo.users (auth_issuer, auth_subject, email) VALUES ($1, $2, $3) RETURNING id",
    [input.issuer, input.subject, input.email ?? null],
  );
}

export function provisionMembership(
  db: Queryable,
  input: {
    organizationId: string;
    userId: string;
    role: "owner" | "admin" | "approver" | "viewer";
  },
): Promise<string> {
  return insertOne(
    db,
    "INSERT INTO axo.memberships (organization_id, user_id, role) VALUES ($1, $2, $3) RETURNING id",
    [input.organizationId, input.userId, input.role],
  );
}

export function provisionEnvironment(
  db: Queryable,
  input: { organizationId: string; name: string },
): Promise<string> {
  return insertOne(
    db,
    "INSERT INTO axo.environments (organization_id, name) VALUES ($1, $2) RETURNING id",
    [input.organizationId, input.name],
  );
}

/**
 * Open a session for a user WITHOUT going through the identity provider. Owner-only, for the local seed script and the
 * tests: no runtime role can do this, and the application never calls it. Returns the raw tokens (the session cookie
 * value and the CSRF token) exactly as a real login would produce them.
 */
export async function provisionSession(
  db: Queryable,
  input: { userId: string; mfa?: boolean; authAgoSeconds?: number },
): Promise<{ sessionToken: string; csrfToken: string }> {
  const session = newToken();
  const csrf = newToken();
  const mfa = input.mfa ?? true;
  await db.query(
    `INSERT INTO axo.sessions (user_id, token_hash, csrf_hash, idle_expires_at, absolute_expires_at, auth_time, mfa_verified_at, amr)
     VALUES ($1, $2, $3, now() + interval '30 minutes', now() + interval '12 hours',
             now() - make_interval(secs => $4::integer),
             CASE WHEN $5::boolean THEN now() - make_interval(secs => $4::integer) END,
             CASE WHEN $5::boolean THEN ARRAY['pwd','otp'] ELSE ARRAY['pwd'] END)`,
    [input.userId, session.hash, csrf.hash, input.authAgoSeconds ?? 0, mfa],
  );
  return { sessionToken: session.value, csrfToken: csrf.value };
}
