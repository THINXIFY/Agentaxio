# Can Supabase Auth be AgentAxio's identity provider? — evaluation (desk research only)

Date of research: 2026-10-24. Method: Supabase's public documentation. **No Supabase project was created, no account or credential was used, and nothing was integrated.** Anything the documentation does not state is marked *not stated* and must be treated as unknown until tested against a real project, which needs your approval (it means creating an account and possibly a billed project).

## Verdict

**Not confirmed; do not build a Supabase-specific integration yet.** Supabase *can* plausibly be used, but only in one shape, and four requirements cannot be confirmed from its documentation. The existing architecture does not need to change for the plausible shape, and must not change to accommodate the other one.

## The two ways Supabase could be used

1. **Supabase Auth as an OpenID Connect provider** (its "OAuth 2.1 server" feature). AgentAxio stays a relying party exactly as built: it receives an ID token, verifies the signature, and runs its own server-side sessions, CSRF, step-up and roles. **This is the only shape compatible with our architecture** and the one evaluated below.
2. **Supabase Auth as the application's own login** (users sign in with the Supabase client libraries and the app trusts Supabase's access token and refresh cycle). This would replace our server-side sessions with stateless JWTs and an external refresh mechanism, so revocation would no longer be immediate and step-up freshness would depend on Supabase's token refresh. **Rejected: it weakens D2/D13.**

## Requirement by requirement (shape 1)

| Our requirement (code or decision) | What Supabase documents | Status |
|---|---|---|
| OIDC discovery | `https://<ref>.supabase.co/auth/v1/.well-known/openid-configuration` | Meets |
| Authorization code + PKCE (S256) | "OAuth 2.1 authorization code flow with PKCE" | Meets |
| Confidential client with `client_secret_basic` | Supported; default for confidential clients | Meets |
| Asymmetric ID-token signing, JWKS | Required for the `openid` scope ("ID token generation will fail with HS256"); RS256 or ES256 recommended; JWKS endpoint exists; projects default to HS256 so signing keys must be changed | Meets once asymmetric signing is switched on. We accept RS256 and ES256 only; the algorithm actually used is *not stated* |
| `email` and `email_verified` claims | Scopes `openid email profile phone` exist; `email_verified` in the ID token *not stated* | **Unknown** |
| MFA reported to us in the ID token (`amr`, or `acr`) | MFA exists as TOTP and phone codes, reported as `aal1`/`aal2` and `amr` entries **in Supabase's own access token**. Whether the OAuth-server ID token carries `amr`, `aal` or `acr` is *not stated* | **Unknown. Without it AgentAxio fails closed: nothing sensitive could be approved.** |
| MFA strength | TOTP and SMS/phone only; **WebAuthn/passkeys are not documented** as an MFA factor. Phone codes are weaker than TOTP/WebAuthn | Partial. We would want TOTP-only enforced |
| Step-up: `max_age=0` / `prompt=login` and a fresh `auth_time` | *Not stated* for the OAuth server; the MFA documentation describes no maximum age for `aal2` and no built-in step-up | **Unknown, and critical.** Approvals rely on provider re-authentication within 15 minutes (D4) |
| User consent screen | We must build it ourselves and call approve/deny | Extra work, a security-sensitive surface (open redirects, CSRF on consent) |
| Account recovery, email verification, breached-password protection | Part of Supabase Auth; details per project settings | Not verified |
| Session controls on the provider side | Inactivity timeout, time-boxed sessions and single-session limits are **Pro-plan-and-up** features | Our own sessions do not depend on these (D2), so not required |
| Maturity | "OAuth 2.1 server is in **beta**" | A risk for a security-critical dependency |
| Cost | No separate charge; sign-ins count toward monthly active users | Acceptable |

## What would have to be true, and how to find out (needs your approval to run)

Create one throw-away Supabase project with invented users only, then:

1. Turn on asymmetric JWT signing (ES256 or RS256) and the OAuth server; register AgentAxio as a **confidential** client with `client_secret_basic`.
2. Fetch the discovery document: confirm `jwks_uri`, `code_challenge_methods_supported` includes `S256`, `token_endpoint_auth_methods_supported` includes `client_secret_basic`, and the ID-token signing algorithm is RS256 or ES256.
3. Sign in a user who has enrolled **TOTP** and decode the ID token: it must contain `sub`, `email`, `email_verified: true`, and an `amr` (or `acr`) that shows two factors, plus `auth_time` and `iat`. If `amr` is missing or lists only one method after TOTP, the integration cannot meet D4.
4. Send `prompt=login&max_age=0` and confirm the user is asked for **both factors again** and that `auth_time` is fresh. If Supabase ignores them, step-up cannot work and this provider fails our criteria. (AgentAxio already rejects a provider that ignores `max_age`; see the `staleAuthTime` and `honourMaxAge` tests.)
5. Run `apps/api/test/support/live-flow.mjs`-style checks with this provider in place of the test double.

Any "no" at step 3 or 4 is a **stop**: pick a provider that meets `docs/BE-02-DECISIONS.md` "Provider checklist" (for example a managed or self-hosted provider that reports `amr` and honours `max_age`). No code in AgentAxio changes either way, because it is already provider-neutral.

## Sources

- Supabase, "OAuth 2.1 Server" — https://supabase.com/docs/guides/auth/oauth-server
- Supabase, "Getting started with the OAuth 2.1 server" — https://supabase.com/docs/guides/auth/oauth-server/getting-started
- Supabase, "Multi-Factor Authentication" — https://supabase.com/docs/guides/auth/auth-mfa
- Supabase, "User sessions" — https://supabase.com/docs/guides/auth/sessions
