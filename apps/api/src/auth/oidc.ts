import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import * as oidc from "openid-client";
import type { OidcConfig } from "../config";

/**
 * OpenID Connect relying party (docs/BE-02-DECISIONS.md D1): authorization code flow with PKCE (S256), `state` and
 * `nonce`. The protocol-critical work (discovery, signature verification against the provider's JWKS, issuer, audience,
 * expiry, nonce, state, allowed signing algorithms) is done by the vetted `openid-client` library; this file adds the
 * AgentAxio rules on top: what counts as multi-factor, a step-up freshness check, and what a verified identity is.
 *
 * AgentAxio never sees a password. It receives only a signed ID token from the provider.
 */

export interface OidcClient {
  config: oidc.Configuration;
  settings: OidcConfig;
  jwks: ReturnType<typeof createRemoteJWKSet>;
}

export async function createOidcClient(settings: OidcConfig): Promise<OidcClient> {
  const config = await oidc.discovery(
    new URL(settings.issuer),
    settings.clientId,
    undefined,
    oidc.ClientSecretBasic(settings.clientSecret),
    // Development against a local http:// identity provider only. Configuration refuses this in production and refuses an
    // http:// issuer unless it is set explicitly.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    settings.allowInsecure ? { execute: [oidc.allowInsecureRequests] } : undefined,
  );
  const metadata = config.serverMetadata();
  if (metadata.jwks_uri === undefined) {
    throw new Error("the identity provider publishes no signing keys");
  }
  return { config, settings, jwks: createRemoteJWKSet(new URL(metadata.jwks_uri)) };
}

export interface LoginSecrets {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export function newLoginSecrets(): LoginSecrets {
  return {
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
    codeVerifier: oidc.randomPKCECodeVerifier(),
  };
}

export async function buildAuthorizationUrl(
  client: OidcClient,
  secrets: LoginSecrets,
  options: { stepUp: boolean },
): Promise<URL> {
  const challenge = await oidc.calculatePKCECodeChallenge(secrets.codeVerifier);
  const parameters: Record<string, string> = {
    redirect_uri: client.settings.redirectUri,
    scope: "openid email profile",
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: secrets.state,
    nonce: secrets.nonce,
  };
  // Step-up: ask the provider to authenticate the person again now, with multiple factors.
  if (options.stepUp) {
    parameters.prompt = "login";
    parameters.max_age = "0";
  }
  return oidc.buildAuthorizationUrl(client.config, parameters);
}

export interface VerifiedIdentity {
  issuer: string;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  /** When the person actually authenticated at the provider. */
  authTime: Date;
  amr: string[];
  /** True when at least two different kinds of factor were used. */
  mfa: boolean;
}

const KNOWLEDGE = new Set(["pwd", "pin", "kba"]);
const POSSESSION = new Set(["otp", "hwk", "swk", "sms", "tel", "sc", "mca"]);
const INHERENCE = new Set(["fpt", "face", "iris", "retina", "vbm"]);

/**
 * RFC 8176 `amr` values. Multi-factor means the provider says so (`mfa`) or reports factors from at least two
 * different categories (something known, something held, something you are). A password alone, or two passwords, is
 * not multi-factor. A token with no `amr` is not multi-factor: AgentAxio will not guess.
 */
export function isMultiFactor(amr: readonly string[]): boolean {
  if (amr.includes("mfa")) return true;
  const kinds = [
    amr.some((v) => KNOWLEDGE.has(v)),
    amr.some((v) => POSSESSION.has(v)),
    amr.some((v) => INHERENCE.has(v)),
  ].filter(Boolean).length;
  return kinds >= 2;
}

export class LoginError extends Error {
  constructor(
    message: string,
    readonly code:
      "provider_error" | "invalid_response" | "stale_authentication" | "account_disabled",
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * Verify the ID token's SIGNATURE against the provider's published keys, plus issuer, audience, expiry, signing
 * algorithm (RS256 or ES256 only) and nonce. The OpenID rules let a client rely on TLS alone for a token received on
 * the back channel; we deliberately do not, so a transport mistake (or a development http:// provider) can never
 * remove all proof that the token is genuine.
 */
async function verifiedClaims(
  client: OidcClient,
  idToken: string | undefined,
  nonce: string,
  now: Date,
): Promise<JWTPayload> {
  if (idToken === undefined) {
    throw new LoginError("no identity token was returned", "invalid_response");
  }
  try {
    const { payload } = await jwtVerify(idToken, client.jwks, {
      issuer: client.config.serverMetadata().issuer,
      audience: client.settings.clientId,
      algorithms: ["RS256", "ES256"],
      clockTolerance: 60,
      currentDate: now,
    });
    if (payload.nonce !== nonce) throw new Error("nonce mismatch");
    return payload;
  } catch (cause) {
    throw new LoginError("the identity token could not be verified", "invalid_response", { cause });
  }
}

/**
 * Exchange the authorization code and verify the ID token. `callbackUrl` is the full URL the provider redirected the
 * browser to. Any failure (wrong state, replayed or forged code, bad signature, wrong issuer or audience, expired,
 * wrong nonce, disallowed algorithm) throws LoginError: nothing partial is returned.
 */
export async function completeLogin(
  client: OidcClient,
  callbackUrl: URL,
  expected: { state: string; nonce: string; codeVerifier: string; stepUp: boolean },
  now: Date = new Date(),
): Promise<VerifiedIdentity> {
  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(client.config, callbackUrl, {
      pkceCodeVerifier: expected.codeVerifier,
      expectedState: expected.state,
      expectedNonce: expected.nonce,
      idTokenExpected: true,
    });
  } catch (cause) {
    // The cause is kept for diagnosis by a developer; it is never logged or shown to the person.
    throw new LoginError("the identity provider's response was not accepted", "invalid_response", {
      cause,
    });
  }
  const claims = await verifiedClaims(client, tokens.id_token, expected.nonce, now);
  if (typeof claims.sub !== "string" || claims.sub === "" || claims.sub.length > 255) {
    throw new LoginError("the identity token has no subject", "invalid_response");
  }
  const amr = Array.isArray(claims.amr)
    ? claims.amr.filter((v): v is string => typeof v === "string").slice(0, 16)
    : [];
  const issued = typeof claims.iat === "number" ? claims.iat : Math.floor(now.getTime() / 1000);
  const authSeconds = typeof claims.auth_time === "number" ? claims.auth_time : issued;
  // A provider clock slightly ahead is tolerated; far in the future is not.
  if (authSeconds * 1000 > now.getTime() + 60_000) {
    throw new LoginError(
      "the identity token has an authentication time in the future",
      "invalid_response",
    );
  }
  const authTime = new Date(Math.min(authSeconds * 1000, now.getTime()));
  // Step-up must really have re-authenticated the person: a provider that ignores max_age=0 must not be trusted here.
  if (expected.stepUp && now.getTime() - authTime.getTime() > 120_000) {
    throw new LoginError("the person was not re-authenticated", "stale_authentication");
  }
  const email =
    typeof claims.email === "string" && claims.email.length <= 254 ? claims.email : null;
  return {
    issuer: client.settings.issuer,
    subject: claims.sub,
    email,
    emailVerified: claims.email_verified === true && email !== null,
    authTime,
    amr,
    mfa: isMultiFactor(amr),
  };
}
