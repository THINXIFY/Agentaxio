import { createHash } from "node:crypto";
import type pg from "pg";
import { SESSION } from "../config";
import { decryptJson, encryptJson, type KeyRing } from "../crypto/data-keys";
import { newToken, hashToken } from "./tokens";
import {
  buildAuthorizationUrl,
  completeLogin,
  LoginError,
  newLoginSecrets,
  type OidcClient,
} from "./oidc";

/**
 * The browser-facing login steps: start (build the provider URL and remember the secrets) and finish (verify the
 * provider's answer, find or create the user, open a brand-new session).
 *
 * The state, nonce and PKCE verifier live in the database for ten minutes, single use, bound to the browser that
 * started the attempt by a cookie. A replayed link, a link opened in another browser, or an expired attempt is
 * refused.
 */

export interface LoginDeps {
  pool: pg.Pool;
  oidc: OidcClient;
  dataKeys: KeyRing;
  /** Development only: report every login as multi-factor. */
  mfaRequired: boolean;
}

/** Only dashboard paths are valid destinations, so the login cannot be turned into an open redirect. */
export function safeReturnTo(value: string | undefined): string {
  if (
    value === undefined ||
    !/^\/dashboard(\/[A-Za-z0-9_-]+)*(\?[A-Za-z0-9=&_.-]{0,100})?$/.test(value) ||
    value.includes("//")
  ) {
    return "/dashboard";
  }
  return value;
}

const sha256 = (value: string): Buffer => createHash("sha256").update(value, "utf8").digest();

export async function startLogin(
  deps: LoginDeps,
  input: { returnTo: string | undefined; stepUp: boolean },
): Promise<{ authorizationUrl: URL; browserBinding: string }> {
  const secrets = newLoginSecrets();
  const binding = newToken();
  const stateHash = sha256(secrets.state);
  const sealed = encryptJson(
    deps.dataKeys,
    secrets.codeVerifier,
    `oidc|${stateHash.toString("hex")}`,
  );
  await deps.pool.query(
    "SELECT axo.start_login($1::bytea, $2::bytea, $3, $4::bytea, $5, $6, $7, $8::integer)",
    [
      stateHash,
      binding.hash,
      secrets.nonce,
      sealed.ciphertext,
      sealed.keyId,
      safeReturnTo(input.returnTo),
      input.stepUp,
      SESSION.loginTransactionSeconds,
    ],
  );
  return {
    authorizationUrl: await buildAuthorizationUrl(deps.oidc, secrets, { stepUp: input.stepUp }),
    browserBinding: binding.value,
  };
}

export interface FinishedLogin {
  sessionToken: string;
  csrfToken: string;
  returnTo: string;
  userId: string;
  mfa: boolean;
}

export async function finishLogin(
  deps: LoginDeps,
  input: { callbackUrl: URL; browserBinding: string | undefined },
): Promise<FinishedLogin> {
  const state = input.callbackUrl.searchParams.get("state");
  if (
    state === null ||
    state.length < 16 ||
    state.length > 128 ||
    input.browserBinding === undefined
  ) {
    throw new LoginError("missing state or browser binding", "invalid_response");
  }
  const stateHash = sha256(state);
  const found = await deps.pool.query<{
    nonce: string;
    verifier: Buffer;
    key_id: string;
    return_to: string;
    step_up: boolean;
  }>("SELECT * FROM axo.finish_login($1::bytea, $2::bytea)", [
    stateHash,
    hashToken(input.browserBinding),
  ]);
  const transaction = found.rows[0];
  if (transaction === undefined)
    throw new LoginError(
      "this login attempt is unknown, used, expired or from another browser",
      "invalid_response",
    );

  let codeVerifier: unknown;
  try {
    codeVerifier = decryptJson(
      deps.dataKeys,
      transaction.verifier,
      transaction.key_id,
      `oidc|${stateHash.toString("hex")}`,
    );
  } catch {
    throw new LoginError("stored login data could not be read", "invalid_response");
  }
  if (typeof codeVerifier !== "string")
    throw new LoginError("stored login data is malformed", "invalid_response");

  const identity = await completeLogin(deps.oidc, input.callbackUrl, {
    state,
    nonce: transaction.nonce,
    codeVerifier,
    stepUp: transaction.step_up,
  });

  const session = newToken();
  const csrf = newToken();
  const mfa = deps.mfaRequired ? identity.mfa : true;
  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query<{ id: string }>("SELECT axo.login_user($1, $2, $3, $4) AS id", [
      identity.issuer,
      identity.subject,
      identity.email,
      identity.emailVerified,
    ]);
    const userId = user.rows[0]?.id;
    if (userId === undefined) throw new Error("login returned no user");
    await client.query(
      "SELECT axo.create_session($1::uuid, $2::bytea, $3::bytea, $4::timestamptz, $5::text[], $6::boolean, $7::integer, $8::integer)",
      [
        userId,
        session.hash,
        csrf.hash,
        identity.authTime,
        identity.amr,
        mfa,
        SESSION.idleSeconds,
        SESSION.absoluteSeconds,
      ],
    );
    await client.query("COMMIT");
    return {
      sessionToken: session.value,
      csrfToken: csrf.value,
      returnTo: transaction.return_to,
      userId,
      mfa,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function logout(pool: pg.Pool, sessionToken: string): Promise<void> {
  await pool.query("SELECT axo.revoke_session($1::bytea)", [hashToken(sessionToken)]);
}
