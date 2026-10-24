# BE-02 — Human authentication, approvals, trusted execution and the live dashboard

Status: **local development only.** Nothing is deployed, no real identity provider is connected, no real credentials are used, and nothing here has had an independent security review. This document describes what exists; `docs/M02-ACCEPTANCE.md` says what is proven and what is not; `docs/BE-02-DECISIONS.md` records the decisions (and the ones that belong to the owner).

## 1. What was built

```
 browser ──► website (Next.js, :3000)  ── /api/auth/*, /api/v1/* proxied ──►  management API (:8788)   role axo_management
                                                                                │ session cookie only
 agent / n8n ──────────────── access key ──────────────────────────────►  agent API (:8787)           role axo_agent_api
                                                                                │
                              PostgreSQL 17  (row-level security, SECURITY DEFINER functions)
                                                                                │ five functions only
 trusted executor (poller) ───────────── role axo_executor (no table privileges) ┘
        │ fixed connector + service token held only by this process
        ▼
 mock CRM (:8790)  — a mock; it accepts only the executor's token
```

Four processes and three database roles plus the migration owner. Nothing in the agent API or management API can execute an action; the executor cannot read or write any table directly.

| Area | Where |
|---|---|
| Human sign-in (OpenID Connect relying party, PKCE, state, nonce, ID-token signature verified) | `apps/api/src/auth/{oidc,login,cookies,tokens}.ts` |
| Server-side sessions, CSRF, step-up (fresh MFA) | `005_auth.sql`, `apps/api/src/management/context.ts`, `src/http/management-app.ts` |
| Organizations, invitations, roles | `005_auth.sql`, `src/management/people.ts` |
| Approvals (create, review, decide, expire, cancel) | `006_approvals_execution.sql`, `src/management/approvals.ts` |
| Single-use grants, executor claim and result recording | `006_approvals_execution.sql`, `src/executor/{executor,connectors}.ts`, `src/cli/executor.ts` |
| Encryption of submitted parameters | `src/crypto/data-keys.ts` |
| Rate limiting | `src/ratelimit.ts`, `006_approvals_execution.sql` |
| Mock CRM (separate package `@agentaxio/mock-crm`) | `apps/mock-crm` |
| Live dashboard | `apps/web/src/app/dashboard/_live`, `apps/web/src/components/live`, `apps/web/src/lib/api` |

## 2. Management API (cookie session only)

Read endpoints (any member of the organization): `GET /v1/me`, and under `/v1/orgs/:orgId`: `overview`, `environments`, `agents`, `agents/:id/credentials`, `requests`, `requests/:id/executions`, `activity`, `policies`, `policies/:id/versions`, `approvals`, `members`, `invitations`. `GET /v1/orgs/:orgId/approvals/:id` returns the exact submitted values and is released by the database to owners, admins and approvers only.

Write endpoints: `POST /v1/organizations`, `/v1/invitations/accept`, `/auth/logout`, and under `/v1/orgs/:orgId`: `agents`, `agents/:id/{suspend,resume,revoke}`, `agents/:id/credentials` (+ `/:cid/rotate`), `credentials/:cid/revoke`, `policies` (+ `/:id/versions`), `environments/:id/{halt,resume}`, `approvals/:id/decision`, `invitations` (+ revoke), `members/:uid/{role,remove}`.

Sign-in: `GET /auth/login` → provider → `GET /auth/callback`. Every state-changing request must carry the exact `Origin` of the website and an `X-CSRF-Token` matching the session; both are checked before the body is parsed. The user id and organization membership come from the database session row; nothing a client sends is trusted for identity. No OpenAPI document exists yet for the management API (the agent API's is `apps/api/openapi.json`).

## 3. Approval workflow

1. An agent request that the deterministic policy answers `require_approval` is stored with its parameters **encrypted** (AES-256-GCM, bound to organization + request + digest) and one `pending` approval (15-minute deadline) tied to the request digest.
2. Members see pending approvals as metadata. Owners, admins and approvers can open one and see the exact values; viewers cannot.
3. A decision is a single database function (`decide_approval`) that, under row locks, checks: role, fresh MFA, not expired, request still pending, **the digest the reviewer saw equals the stored digest**, and **not self-approval** (the agent's owner, whoever registered it, and whoever issued the key it used are refused, and the attempt is audited). It either rejects (request becomes denied) or approves (request becomes `queued_execution` and exactly one single-use 5-minute grant is created). It returns an outcome instead of raising for the cases that must leave an audit record.
4. Approval is permission, not execution. The dashboard says so, and the request only reads `succeeded` after the executor records it.
5. Suspending an agent or revoking its key cancels its pending approvals and invalidates its open grants in the same transaction.

## 4. Trusted executor

Claim = one transaction: lock the grant and everything it depends on → decrypt and verify the parameters against the approved digest → re-evaluate the **current** policy with the same pure evaluator the agent API uses → `claim_finish` re-reads agent, key, environment, approval, expiry and policy epoch under the locks and either consumes the grant and starts one attempt, or invalidates the grant and closes the request with the reason. The destination is called **after** that transaction commits, through one fixed connector (`crm.lead.create` → the configured mock CRM, `Idempotency-Key` = request id, no redirects, bounded timeout). The result is recorded in a second transaction as `succeeded`, `failed` (the destination cannot have acted) or `unknown` (timeout, lost connection, 5xx, unreadable answer, executor crash). **An unknown outcome is never retried.** Attempts left `started` by a crash are closed as `unknown` by the sweeper; a late result from a zombie executor is refused.

## 5. Security hardening summary

Cross-tenant: row-level security plus composite foreign keys; every management query runs inside a session + organization context established by the database. Rate limits (PostgreSQL-backed, hashed keys, fail closed): 120 agent requests/min/agent, 30 failed agent authentications/min/address, 20 sign-in starts/min/address, 60 writes/min/session, 30 approval decisions/min/session. Errors: generic body + trace id; no stack, SQL or stored value. Logs: no bodies, headers, cookies or database error text. Secrets (pepper, data keys, OIDC client secret, mock-CRM token, database passwords) come only from the environment. The ID token signature is verified by our own code against the provider's keys, because the OIDC library does not verify it for back-channel responses.

## 6. Running it locally

Everything below is a local demonstration with invented people and a throw-away database. Nothing is saved when you stop it.

```
pnpm install
pnpm --filter @agentaxio/api dev:stack        # terminal 1: Postgres, agent API, management API, executor, mock CRM, stand-in sign-in page
# terminal 2 (PowerShell):  $env:AXO_API_URL="http://127.0.0.1:8788"; pnpm --filter @agentaxio/web dev
# open http://localhost:3000/dashboard  → sign in as "ada" (first person: creates the organization)
```

Invite a second person (the approver) from the API (`POST /v1/orgs/:id/invitations`; the token is shown once) — there is no screen for invitations yet. `node apps/api/test/support/live-flow.mjs` walks the whole golden path over HTTP against a fresh stack. Without `AXO_API_URL` the dashboard shows its labelled sample-data mode.

For a persistent local database use `pnpm --filter @agentaxio/api db:setup`, `db:migrate`, then `dev:management`, `dev`, `dev:executor` and `pnpm --filter @agentaxio/mock-crm start`, with an OpenID Connect provider you control (see `apps/api/.env.example`).

## 7. Known gaps (not hidden)

- No real identity provider has been connected; interoperability is verified only against a protocol test double.
- Keys live in the process environment; a key-management service is a hosting decision.
- No email: invitation tokens are shown once to the inviter. No screens yet for invitations, role changes, organization switching, billing, settings or integrations (they stay labelled).
- Agents can create a lead only in the mock CRM. n8n and other tools are not connected; only calls to the AgentAxio API are controlled.
- A single owner or admin can still loosen a rule (for example to "allowed"); it is audited and needs fresh MFA but not a second person (see D6).
- No independent security review and no load testing.
