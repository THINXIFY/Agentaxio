# BE-02 — Decision record (written before implementation)

Status: decisions D1–D14 are the ones this milestone implements. Each is marked **Implemented as decided** (a technical choice that follows from approved requirements) or **Needs owner ratification** (a business or vendor choice that cannot be made by the engineer; the code works with the stated default and does not depend on the final answer). Nothing in this record is a claim of production readiness.

Inputs: `docs/BE-01A-ARCHITECTURE-REVIEW.md` (open questions Q3, Q4, Q5, Q8, Q9, Q10), `docs/SECURITY.md`, `docs/SECURITY-ACCEPTANCE.md`, `docs/N8N-ENFORCEMENT.md`, `CLAUDE.md` ("explicit user approval before deploying, migrating production, enabling billing or using real credentials").

## D1 — Q3: how humans authenticate  ·  Needs owner ratification (vendor); architecture implemented as decided

**Decision.** AgentAxio is an **OpenID Connect relying party** (authorization-code flow with PKCE, `state` and `nonce`, ID-token signature verified against the provider's JWKS). **AgentAxio stores no passwords, no password hashes, no TOTP secrets and no recovery tokens.** Signup, login, password recovery, email verification and MFA enrolment are done by the identity provider. AgentAxio owns everything after the ID token: server-side sessions, organization membership, roles, step-up, CSRF and authorization.

**Options considered**

| Option | Strengths | Why not (or why) |
|---|---|---|
| **Managed OIDC provider** (for example Auth0, WorkOS, Okta, Cognito, Entra External ID) | Specialist handles credential storage, breached-password checks, MFA, recovery, abuse controls; standard protocol; replaceable | **Chosen shape.** Costs money and needs a real tenant |
| **Self-hosted OIDC provider** (Keycloak, Zitadel) | No vendor fee, full control, OpenID-certified | Same protocol, so also supported. Operating an identity system securely is a full-time duty for a small team |
| **Auth library inside our app** (Auth.js, Better Auth, Lucia) storing users and passwords in our database | One system, no extra vendor | We would own password storage, recovery flows, MFA enrolment and their abuse protections: the largest attack surface for the least differentiating work. Rejected for V1 |
| **Own implementation** | None | Rejected |

**Why the vendor is not chosen here.** Choosing and creating a real tenant means using real credentials, accounts and possibly billing, which `CLAUDE.md` reserves for explicit owner approval. The code is therefore provider-neutral: it needs only discovery, authorization code + PKCE, RS256/ES256 ID tokens, `email` and `email_verified`, and (for MFA) `amr` or `acr` plus `auth_time`. **Owner action:** pick a provider that meets the checklist in section "Provider checklist" below and supply issuer, client id and client secret as environment variables.

**What is verified, and what is not.** The relying-party code is tested end to end against a **local OpenID provider test double** that speaks the real protocol (discovery, JWKS, PKCE-checked token endpoint, signed ID tokens) and can be told to misbehave (wrong audience, issuer, nonce, expiry, algorithm confusion, missing claims). **Interoperability with a live provider is unverified** until the owner connects one.

**Provider checklist.** OIDC discovery; authorization code + PKCE (S256); asymmetric ID-token signing; `email_verified`; TOTP and WebAuthn MFA reported in `amr` (or an `acr` value); `max_age` / `prompt=login` support for step-up; breached-password protection; rate limiting and lockout of its own; hosted recovery and email verification; data-residency options matching the owner's hosting choice.

## D2 — Sessions  ·  Implemented as decided

Opaque 256-bit random token in a `__Host-` cookie (`HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain`). Only its SHA-256 is stored. A new session is created at every login (no fixation); the previous one is revoked. Idle timeout 30 minutes, absolute lifetime 12 hours; logout revokes server-side; a disabled user's sessions stop working at once. Session state is checked in the database on every request (no stateless tokens, so revocation is immediate). These numbers are defaults chosen by the engineer; they are constants in one file and may be tightened.

## D3 — CSRF and request origin  ·  Implemented as decided

Every state-changing management request must carry (a) a per-session CSRF token in `X-CSRF-Token` (only its hash is stored), and (b) an `Origin` equal to the configured web origin. Both are verified before any handler runs. The agent API is not cookie-based and is unaffected.

## D4 — MFA  ·  Implemented as decided

MFA is performed by the provider. AgentAxio **verifies it** from the ID token (`amr` with at least two distinct factors, or the configured `acr`) and records `mfa_verified_at`. Sensitive actions require MFA performed within the last **15 minutes**; otherwise the API answers `403 STEP_UP_REQUIRED` and the dashboard sends the user back through the provider with `max_age=0`. The check is made **inside the database function** for approvals, so no API bug can approve without it. Actions that require fresh MFA: approve/reject, issue or replace a credential, create or revise a policy, create an organization, create an invitation, change or remove a member. Actions that **stop** things are deliberately not gated (suspend or revoke an agent, revoke a credential, halt an environment), so a responder is never locked out of stopping something. **Switching things back on** (resume an agent, resume an environment) is gated, because it lets a stopped agent act again. Registering an agent is not gated because a new agent can do nothing until a gated action gives it a key and a rule. If the provider cannot report MFA, nothing sensitive can be done: it fails closed (a development-only switch exists and is refused in production).

## D5 — Q4: self-approval  ·  Implemented as decided (recommendation accepted by default in BE-01A); owner may amend

An approver may not approve or reject a request if they are, for the agent that made it: **the owner**, **the person who registered it**, or **the person who issued the credential it used**. This is enforced in the database function that records the decision (not in application code), so it holds for every caller. Consequence: the golden path needs at least two human members, which `docs/PRD.md` step 1 already assumes. A blocked attempt is recorded in the audit trail.

## D6 — Q5: who may approve  ·  Implemented as decided

`owner`, `admin` and `approver` may decide approvals; `viewer` may not. **Separation of duties (added in the final BE-02 review, closing risk T9 of BE-01A):** a person who wrote *any version* of a rule that applies to a request (same action; the rule covers the request's agent and environment, or is organization-wide) cannot approve or reject that request. The attempt is refused in the database function, returns `403 POLICY_AUTHOR` and is audited (`approval.policy_author_blocked`). Together with D5 this means the person who sets an agent up, the person who writes its rules and the person who approves its requests are three different people, or at least never the same person for the same request. **Remaining risk:** one owner or admin can still *loosen* a rule (for example from "needs approval" to "allowed"), which removes the approval requirement for future requests; the change is audited and needs fresh MFA but not a second person. Two-person control for loosening changes is a candidate for a later milestone.

## D7 — Approvals and grants  ·  Implemented as decided

Approval is permission, not execution. The decision function (a single `SECURITY DEFINER` entry point) locks the approval and the request, then checks, in one transaction: role, fresh MFA, not expired, request still `pending_approval`, **the digest the reviewer saw equals the stored digest**, not self-approval. An approval creates exactly one single-use execution grant (5-minute TTL). A direct `allow` also gets a grant. **A required approval can never be skipped by a general allow**: the policy result is `require_approval` by precedence, and the executor refuses to run any request whose policy now requires approval but which has no approved, digest-matching approval. A request allowed at submission whose policy later becomes `require_approval` is denied at claim time (`POLICY_CHANGED`). The control is the **re-evaluation of the current rules for that exact request** at claim time; an earlier, redundant comparison of "policy epoch" numbers was removed because it compared a value with itself and could never fail.

## D8 — Trusted execution  ·  Implemented as decided

A separate OS process and database role (`axo_executor`) with **no table privileges at all**: it works only through five database functions (claim lock, claim finish, record result, sweep, maintenance). Claim = one transaction that locks the grant and re-checks agent, credential, environment, approval and (in code) the current policy, then consumes the grant and starts an attempt atomically. The downstream call happens **after** commit and never inside a transaction. Outcomes `succeeded`, `failed`, `unknown` are recorded separately. A timeout or crash is `unknown`; **an unknown outcome is never retried automatically**. The destination is a fixed connector for `crm.lead.create` talking to a fixed, configured mock CRM base URL with a service token that only the executor process holds; no URL, credential, tool name or command is ever read from a request, a policy or the database.

## D9 — Q8: sensitive data and key management  ·  Encryption implemented; KMS vendor needs owner ratification

Submitted parameters are encrypted **in the application** with AES-256-GCM before they reach the database: random 96-bit nonce, additional authenticated data = organization id + request id + digest (so a ciphertext cannot be moved to another row or tenant), versioned key id. The digest stays readable because approvals and grants refer to it. Management cannot read the ciphertext column; reviewers receive decrypted values only through a database function that checks the reviewer's role. Data keys come from an environment-provided key ring (`AXO_DATA_KEYS`, current key id `AXO_DATA_KEY_ID`) behind a small `KeyProvider` interface; **rotation** = add a key, make it current, old keys stay for decryption. **Owner action:** choose a production key-management service (KMS) and secret store (depends on the hosting decision); until then keys live in the process environment, which is not acceptable for production. The credential pepper, the data keys, the OIDC client secret and the mock-CRM token are all secrets supplied only through the environment, never stored in the repository or the database.

## D10 — Q9: retention  ·  Mechanism implemented; periods need owner/legal ratification

| Data | Default |
|---|---|
| Submitted parameters (encrypted) | Erased (ciphertext set to NULL, digest kept) **30 days after the request reaches a final state** |
| Audit events | Kept; they contain ids, reason codes, field names and digests only, never parameter values. No automatic deletion until a retention policy is approved |
| Decisions, approvals, grants, execution attempts | Kept with the audit trail |
| Sessions | Rows deleted 30 days after they expire or are revoked |
| Login transactions, expired invitations, rate-limit counters | Deleted when stale (minutes to days) |

The 30-day period is a placeholder default. The legal basis and the real periods are a business/legal decision.

## D11 — Q10: rate limiting  ·  Implemented as decided (PostgreSQL-backed)

Fixed-window counters in PostgreSQL, shared by every instance, behind one database function; keys are hashed so no IP address or user id is stored in clear. If the limiter cannot run, the request fails closed (503). Defaults: agent requests 120/min per agent; failed agent authentications 30/min per source address; login starts 20/min per address; management writes 60/min per user; approval decisions 30/min per user. Behind a reverse proxy the trusted-proxy setting must be configured or every client shares one address (documented). A lockout of a single agent key by guessing is deliberately **not** implemented, because it would let an attacker lock out a legitimate agent.

## D12 — Organization membership and roles  ·  Implemented as decided

Any verified signed-in user may create an organization (maximum 3 per user) and becomes its `owner`. Others join by **invitation**: a single-use, 7-day token (hashed at rest) bound to an email address; accepting requires a signed-in user whose provider-verified email matches. The token is shown once to the inviter (there is no outbound email in this milestone). Role changes follow fixed rules enforced in the database: nobody changes their own role, only an owner can create or remove an owner, an admin can manage only approvers and viewers, the last owner cannot be removed.

## D13 — Management API authentication  ·  Implemented as decided

The management API accepts only the session cookie. The user id is read from the session row; **no user id, organization id or role supplied by a client is trusted**. A client names an organization in the URL, but membership of the session's user in that organization is proven in the database before any other statement runs. The agent API and management API are separate processes with separate database roles and cannot be reached with each other's credentials.

## D14 — Dashboard integration  ·  Implemented as decided

The dashboard keeps its sample-data mode (labelled) when no API is configured. When `AXO_API_URL` is set it switches to **live** mode: the browser talks only to its own origin (`/api/*`, proxied by Next.js to the management API), pages require a signed-in session, and each live page replaces its sample data only where the corresponding endpoint exists and is tested. Unavailable features stay labelled as not built.

## Unresolved business decisions this milestone cannot make

1. The identity provider vendor and tenant (D1).
2. The production key-management service and secret store (D9), tied to the hosting provider and region.
3. Legal retention periods (D10).
4. Outbound email for invitations and notifications (no email provider chosen).
5. Whether policy editors may approve under their own policies (D6).

## Supabase Auth as the identity provider (desk evaluation, 2026-10-24)

Not confirmed, nothing integrated: see `docs/BE-02-SUPABASE-AUTH-EVALUATION.md`. It could only be used as an OpenID Connect provider (never as the application's own login), and it is unknown from its documentation whether its ID token carries `amr`/`acr` and `email_verified`, whether `max_age`/`prompt=login` step-up works, and the OAuth server is in beta with no documented WebAuthn. Production **key management (KMS)** and **retention periods** remain unresolved owner decisions (D9, D10).
