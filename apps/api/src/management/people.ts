import { randomUUID } from "node:crypto";
import { SESSION } from "../config";
import { newToken, hashToken } from "../auth/tokens";
import { invalid, notFound } from "../errors";
import {
  assertUuid,
  requireAdmin,
  requireStepUp,
  type ManagementContext,
  type SessionContext,
} from "./context";

/**
 * Who I am, organizations, members and invitations (docs/BE-02-DECISIONS.md D12). The rules that matter (nobody changes
 * their own role, only an owner manages owners and admins, the last owner stays, an invitation works only for the
 * verified email it names) are enforced inside the database functions these call. The checks here exist to give
 * clear errors, not to be the last line of defence.
 */

export interface Membership {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: "owner" | "admin" | "approver" | "viewer";
}

export interface Me {
  userId: string;
  email: string | null;
  emailVerified: boolean;
  mfaFresh: boolean;
  memberships: Membership[];
}

export async function whoAmI(session: SessionContext): Promise<Me> {
  const result = await session.tx.query<{
    user_id: string;
    email: string | null;
    email_verified: boolean;
    organization_id: string | null;
    organization_name: string | null;
    organization_slug: string | null;
    role: Membership["role"] | null;
  }>("SELECT * FROM axo.whoami()");
  const first = result.rows[0];
  if (first === undefined) throw notFound("user not found");
  return {
    userId: first.user_id,
    email: first.email,
    emailVerified: first.email_verified,
    mfaFresh: session.mfaFresh,
    memberships: result.rows.flatMap((r) =>
      r.organization_id === null ||
      r.organization_name === null ||
      r.organization_slug === null ||
      r.role === null
        ? []
        : [
            {
              organizationId: r.organization_id,
              organizationName: r.organization_name,
              organizationSlug: r.organization_slug,
              role: r.role,
            },
          ],
    ),
  };
}

const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export async function createOrganization(
  session: SessionContext,
  input: { name: string; slug: string },
): Promise<{ organizationId: string }> {
  requireStepUp(session);
  const name = input.name.trim();
  if (name.length < 1 || name.length > 120) throw invalid("name must be 1 to 120 characters");
  if (!SLUG.test(input.slug))
    throw invalid("slug must be 3 to 40 lowercase letters, digits or hyphens");
  const created = await session.tx.query<{ id: string }>(
    "SELECT axo.create_organization($1, $2) AS id",
    [name, input.slug],
  );
  const id = created.rows[0]?.id;
  if (id === undefined) throw new Error("organization was not created");
  return { organizationId: id };
}

export interface MemberRow {
  userId: string;
  email: string | null;
  role: string;
  createdAt: string;
}

export async function listMembers(context: ManagementContext): Promise<MemberRow[]> {
  const result = await context.tx.query<{
    user_id: string;
    email: string | null;
    role: string;
    created_at: Date;
  }>("SELECT user_id, email, role, created_at FROM axo.list_members()");
  return result.rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    role: r.role,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function changeMemberRole(
  context: ManagementContext,
  input: { userId: string; role: string },
): Promise<void> {
  requireAdmin(context);
  requireStepUp(context);
  assertUuid(input.userId, "user id");
  await context.tx.query("SELECT axo.change_member_role($1::uuid, $2)", [input.userId, input.role]);
}

export async function removeMember(
  context: ManagementContext,
  input: { userId: string },
): Promise<void> {
  requireAdmin(context);
  requireStepUp(context);
  assertUuid(input.userId, "user id");
  await context.tx.query("SELECT axo.remove_member($1::uuid)", [input.userId]);
}

export interface InvitationRow {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  state: "open" | "accepted" | "revoked" | "expired";
}

export async function listInvitations(context: ManagementContext): Promise<InvitationRow[]> {
  requireAdmin(context);
  const result = await context.tx.query<{
    id: string;
    email: string;
    role: string;
    expires_at: Date;
    accepted_at: Date | null;
    revoked_at: Date | null;
  }>(
    `SELECT id, email, role, expires_at, accepted_at, revoked_at FROM axo.invitations
      ORDER BY created_at DESC LIMIT 100`,
  );
  const now = Date.now();
  return result.rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    expiresAt: r.expires_at.toISOString(),
    state:
      r.accepted_at !== null
        ? "accepted"
        : r.revoked_at !== null
          ? "revoked"
          : r.expires_at.getTime() <= now
            ? "expired"
            : "open",
  }));
}

/** The raw token is returned ONCE to the inviter (there is no outbound email yet). Only its hash is stored. */
export async function createInvitation(
  context: ManagementContext,
  input: { email: string; role: string },
): Promise<{ invitationId: string; token: string; expiresInSeconds: number }> {
  requireAdmin(context);
  requireStepUp(context);
  const token = newToken();
  const created = await context.tx.query<{ id: string }>(
    "SELECT axo.create_invitation($1, $2, $3::bytea, $4::integer) AS id",
    [input.email.trim(), input.role, token.hash, SESSION.invitationSeconds],
  );
  const id = created.rows[0]?.id;
  if (id === undefined) throw new Error("invitation was not created");
  return { invitationId: id, token: token.value, expiresInSeconds: SESSION.invitationSeconds };
}

export async function revokeInvitation(
  context: ManagementContext,
  input: { invitationId: string },
): Promise<void> {
  requireAdmin(context);
  assertUuid(input.invitationId, "invitation id");
  await context.tx.query("SELECT axo.revoke_invitation($1::uuid)", [input.invitationId]);
}

/** Needs a session only: the invitation names the organization. The database also checks the verified email. */
export async function acceptInvitation(
  session: SessionContext,
  input: { token: string },
): Promise<{ organizationId: string }> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.token)) throw notFound("invalid invitation");
  const accepted = await session.tx.query<{ organization_id: string }>(
    "SELECT axo.accept_invitation($1::bytea) AS organization_id",
    [hashToken(input.token)],
  );
  const id = accepted.rows[0]?.organization_id;
  if (id === undefined) throw notFound("invalid invitation");
  return { organizationId: id };
}

/** Exposed for tests that need a unique slug. */
export const uniqueSlug = (prefix: string): string => `${prefix}-${randomUUID().slice(0, 8)}`;
