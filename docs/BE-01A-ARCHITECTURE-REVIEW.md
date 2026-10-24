# BE-01A — Backend architecture and security review

Status: **approved by the owner on 2026-10-24 ("approved"), taken to mean every recommendation in Q1–Q14 is accepted as written** (Q3, Q8–Q10 stay open decisions with a stated deadline; Q2's Docker install is still to be done on the owner's machine). Implementation follows slice by slice (section 11); each slice is reviewed before the next. Branch `be-01-backend-foundation`. No code, migration, dependency or frontend file was changed. The existing baseline documents (`PRD`, `ARCHITECTURE`, `DATABASE`, `SECURITY`, `N8N-ENFORCEMENT`, `PHASE1-DECISIONS`, `SECURITY-ACCEPTANCE`, `CLAUDE-MILESTONE-01`, `ROADMAP`) are untouched. Where this review proposes changing one, it says so (section 2) and waits for approval.

Precedence used when documents disagree: `SECURITY-ACCEPTANCE` (S01–S20) > `N8N-ENFORCEMENT` > `PHASE1-DECISIONS` > `CLAUDE-MILESTONE-01` > `ARCHITECTURE` > `DATABASE` > `PRD` (as the older, proposed baseline). Nothing below relaxes an S-criterion.

Contents: 1 Summary · 2 Contradictions and gaps · 3 ADR · 4 Architecture · 5 Security model · 6 n8n boundary · 7 Database · 8 API · 9 Threat model · 10 Tests · 11 Implementation plan · 12 Open questions

---

## 1. Summary of recommendations

1. **Modular monolith, three runtime roles.** One TypeScript codebase (`apps/api`) deployed as three roles with separate credentials: `agent-api` (agent keys), `management-api` (human sessions), `executor` (internal, no HTTP surface for agents). The shared policy logic is a pure package (`packages/policy`).
2. **PostgreSQL is the only source of truth for decisions.** Decision, state change and audit event commit in **one transaction**. If the audit write fails, the transaction rolls back and the action is not authorized.
3. **Three database roles, row-level security as a backstop.** The application never connects as the table owner. Tenant scoping is enforced twice: every repository function requires an `organizationId`, and RLS (forced) rejects anything that slips through.
4. **No grant ever leaves the server.** A grant is a database row claimed by the executor with one atomic `UPDATE … RETURNING`. There is no grant HTTP endpoint, so no route exists to expose.
5. **Re-evaluate at execution, do not just compare versions.** The executor re-runs the same pure policy function against current policies, agent state, credential state and environment state, inside the claim transaction.
6. **Approval is a decision, not an outcome.** `approved`, `queued_execution`, `running`, `succeeded` are separate states with separate audit events. A crash after `running` yields `unknown`, never an automatic retry.
7. **V1 stays small:** one approver decision per request, a code-owned action catalog, no outbox, no integrations table, no approval chains, no billing, no SDK.

Eight contradictions need a ruling (section 2.1) and 14 open questions need founder approval (section 12). Two block starting M01: **Q1 (what "agent creation" excludes) and Q2 (local Postgres: Docker is not installed on this machine).** Q3 (human-auth provider) blocks M02, not M01.

---

## 2. Review of existing documentation

### 2.1 Contradictions and inconsistencies (proposed resolution)

| # | Conflict | Where | Proposed resolution |
|---|---|---|---|
| C1 | **Approver must see the exact parameters, but `safe_parameters` is "minimized/redacted".** A redacted payload can neither be reviewed exactly nor executed. | `DATABASE.md` vs `PHASE1` ("reviewer sees canonical action preview"), `PRD` step 6 | Store `canonical_parameters` in full while the request is live (the executor needs them). After a terminal state, a retention job reduces them to the digest (period is Q9). **Audit events, logs and error bodies never contain parameter values**, only field names and the digest. Column-level encryption waits for the KMS decision (Q8). |
| C2 | **Environment isolation is ambiguous.** `PHASE1` says a key is "per-organization, per-agent, per-environment"; `DATABASE` gives `agents` an `environment_id` but `agent_credentials` none. | S03 | An agent belongs to exactly **one** environment. A credential belongs to one agent, so it inherits that environment. Composite foreign keys enforce same-organization and same-environment. One physical agent used in dev and prod is two agent records. |
| C3 | **Policy "version" is a mutable counter on a row.** `DATABASE` says versions must be distinguishable and retained, and S10 requires stale grants to be invalidated even when a *different* policy changed (for example a new deny rule). | `DATABASE`, S10 | Policies are **immutable rows** (`policy_versions`); an edit inserts a new version. Each organization-environment also carries a monotonic `policy_epoch`, bumped in the same transaction as any change. A decision records the matched `policy_version_id` and the `policy_epoch`. At execution the policy is re-evaluated regardless of epoch (the epoch only makes staleness visible in audit). |
| C4 | **`nonce_hash` on grants assumes a bearer grant**, but the grant is never transmitted. | `DATABASE`, `PHASE1` | Drop the nonce. Single use is `consumed_at IS NULL` claimed atomically; one grant per request (`UNIQUE(action_request_id)`). If a grant is ever transmitted between processes, add a nonce then. |
| C5 | **`unknown` is both an execution status and the S19 probe response.** | `N8N-ENFORCEMENT`, S19 | `unknown` means *only* "execution outcome uncertain". A request id that does not exist, or belongs to another organization, returns an identical `404 NOT_FOUND`. |
| C6 | **Schema-invalid input: "denied" or "rejected"?** `PRD` says out-of-schema fields are denied by policy; S17 says rejected. | `PRD` step 3, S17 | Two different things. Invalid shape (unknown keys, bad email, oversize) is `422 INVALID_REQUEST`, no `action_request` row, and an audit event without the payload. Unknown or disabled action key is a recorded `denied` / `UNKNOWN_ACTION`. A policy `deny` is a recorded `denied` / `POLICY_DENY`. The PRD example policy is satisfied because the strict schema is always on. |
| C7 | **"No self-approval" is undefined when the requester is an agent, not a human.** | S07, `PRD` | Proposed rule (Q4): an approver may not be the agent's `owner_user_id`, nor the user who issued the credential that made the request. Consequence: the golden path needs **two human members** (matches `PRD` step 1, which invites an approver). |
| C8 | **"Suspend" semantics differ.** `ARCHITECTURE` says suspend also "rotate/disable credentials"; `DATABASE` has `suspended` plus `revoked_at`. | `ARCHITECTURE` endpoint list | Two operations. **Suspend** is reversible: the agent status is checked on every request, credentials are untouched but unusable. **Revoke agent** is permanent: `revoked_at` set, all credentials revoked. Credential rotate/revoke is separate. Un-suspending never revives old requests or grants. |
| C9 | **`CLAUDE.md` describes M01 as the whole vertical slice** (approval, grant, execution, revoke), while `CLAUDE-MILESTONE-01` limits M01 to authorization with "no downstream side effect". | `CLAUDE.md` vs milestone doc | The milestone document governs. `CLAUDE.md`'s slice is M01 + M02 combined. |

### 2.2 Gaps (nothing in the documents covers these)

| Gap | Why it matters | Proposal |
|---|---|---|
| **Invitations** | Golden path step 1 "invites an approver", but there is no table | Add `invitations` (hashed token, email, role, expiry, single-use). |
| **Role-change rules** | S16: "approver cannot grant own admin access" | Permission matrix in 5.2; last-owner protection; nobody changes their own role. |
| **Emergency disable above agent level** | Requirement 9; only per-agent suspend exists | `environments.enforcement_state` (`active`/`halted`): a halted environment denies new requests and blocks all grant claims. Owner/admin only. |
| **Approval `canceled` state** | Suspending an agent must cancel its pending approvals | Add to `approval_requests.state`; the request status becomes `denied` / `AGENT_SUSPENDED`. |
| **Request state machine** | The status list exists; the legal transitions do not | Section 4.3. |
| **Tenant-less credential lookup** | The key prefix must be resolved *before* the organization is known, which RLS would block | `SECURITY DEFINER` lookup function returning only the fields needed to verify (7.4). |
| **Grant and request TTLs** | Only the 15-minute approval TTL is specified | Proposed: approval 15 min (approved), direct-allow claim deadline 5 min, grant 5 min after approval. All config constants, not magic numbers. |
| **Time source** | Expiry compared across app instances can skew | Database `now()` is the only clock for expiry and ordering. `evaluatePolicy` takes `now` as a parameter for tests only. |

### 2.3 Documents out of date relative to later decisions

- `PRD` lists a "basic TypeScript SDK" as must-have; `PHASE1-DECISIONS` defers it. Later decision wins.
- `DATABASE.md` lists `action_definitions` as organization-owned with a JSON Schema in the database (proposal in 7.2), `approval_votes`, `integrations` and `outbox_events` (proposals in 7.2).
- `ARCHITECTURE` lists grant creation/consumption and result reporting as "internal endpoints". Proposal: they are not endpoints at all (4.2).

### 2.4 Local environment finding

**Docker and `psql` are not installed on this machine** (checked: `docker`, `psql` not found; Node 24 present). `CLAUDE-MILESTONE-01` requires local PostgreSQL via Docker Compose, and several acceptance tests (S11 race, RLS, role grants) must run against real PostgreSQL, not a mock or an in-memory substitute. See Q2.

---

## 3. Architecture decision record

**ADR-BE-001 — Authorization core for AgentAxio V1**

**Context.** AgentAxio authorizes and records actions proposed by AI agents through n8n. Approved baseline: n8n-first, trusted executor, deterministic default-deny policy, PostgreSQL transactional state, modular monolith. Product boundary: only integrated, executor-routed actions are controlled; direct credentials held elsewhere can bypass it, and the product must say so.

**Decisions.**

| # | Decision | Alternative rejected | Reason |
|---|---|---|---|
| D1 | Modular monolith, three deployable roles | Microservices | Phase 1 decision; roles give the isolation that matters (credentials, DB grants) without network complexity. |
| D2 | Fastify + Zod (schemas shared from `packages/contracts`) | Express; Next route handlers | Schema-first routing; route-level auth declarations make an "every route declares its auth class" test possible. *Low-stakes, easy to change before M01 starts.* |
| D3 | Plain SQL migrations + Kysely typed queries | Full ORM | RLS, triggers, `SECURITY DEFINER` functions, partial indexes and role grants are first-class here; ORMs hide them. |
| D4 | RLS as defence in depth, enabled from the first migration | RLS later (`DATABASE` migration 006) | M01 already requires cross-organization tests; the guard costs less to add now than to retrofit. |
| D5 | Agent keys: 256-bit random secret, **HMAC-SHA-256 with a server-side pepper** | Argon2/bcrypt | The secret is high-entropy, so slow hashing adds nothing but a per-request CPU DoS vector. Peppered HMAC means a stolen database alone cannot verify guesses. |
| D6 | Grant = row claimed by atomic `UPDATE … RETURNING`; no HTTP surface | Signed/bearer grant token | Nothing to leak or replay; bypass needs database access, not a route. |
| D7 | Re-evaluate policy at execution | Compare policy version numbers | Version comparison misses a *new* deny policy added after approval. |
| D8 | Action catalog is code-owned and global | Organization-authored JSON Schema in the database | A customer-supplied schema would influence what the executor accepts. |
| D9 | Audit append in the same transaction as the state change | Async event stream | No state change without a record; no record without a state change. |
| D10 | `HTTP 503` for any dependency failure; never a synthesized allow | Retry-and-allow | Fail closed. |

**Consequences.** A small number of simple components, with the invariants enforced by the database and tests instead of by convention. Costs: the executor needs its own DB role and deployment; the RLS tests add setup work; the credential lookup function is a deliberate hole in RLS that needs its own review.

**Explicit non-goals (V1):** multi-agent orchestration, agent creation or hosting, billing, analytics, SDK, custom n8n node, approval chains, SSO/SCIM, OAuth brokering, tamper-evident audit, any real downstream tool.

---

## 4. Backend architecture

### 4.1 Components and trust zones

```
 Browser (human)  ──cookie session──▶  management-api ─┐
 n8n / workflow   ──Bearer agent key─▶  agent-api ──────┼──▶ PostgreSQL (3 DB roles, RLS)
                                                        │         ▲
 executor (internal, no inbound agent traffic) ─────────┘         │ claims grants, writes attempts
        │ service token held only here                            │
        ▼                                                         │
   mock CRM service (separate process, not routable from n8n) ────┘ (no DB access)
```

- `packages/policy`: pure `evaluatePolicy` (no I/O, no clock, no network, no LLM). `packages/contracts`: Zod schemas, action catalog, reason codes, status enum, error codes, canonicalization. `apps/api`: the three roles. `apps/mock-crm` (M02): a tiny HTTP service, **not** a table inside the main database, so S18 ("n8n cannot invoke the mock write endpoint") is a real network-level test.
- Each role has its own database user and environment config. The agent-api and management-api processes never hold the mock-CRM service token. Only the executor does.
- The Next.js `apps/web` is a client of `management-api`. It receives no database credentials.

### 4.2 Why there is no grant endpoint

`ARCHITECTURE.md` lists internal "grant creation and consumption" and "execution result reporting" under *Internal only*. The strongest form of internal-only is **no route**: the approve handler (management-api) inserts the grant row in the approval transaction; the executor claims it with SQL; the result is written by the executor directly. The executor's DB role cannot read agent keys or sessions, and neither web-facing role can update `execution_attempts` or `execution_grants.consumed_at`.

### 4.3 Request state machine

```
                 ┌───────────── denied (final) ◀──────────────┐ policy deny / unknown action /
 submit ─▶ evaluate                                           │ agent suspended / env halted /
                 ├─ require_approval ─▶ pending_approval ──deny/cancel/expire──▶ denied | expired
                 │                          │ approve (digest + role + not self)
                 │                          ▼
                 └─ allow ─────────────▶ approved ─▶ queued_execution ─▶ running ─▶ succeeded
                                                                              ├────▶ failed
                                                                              └────▶ unknown (crash/timeout)
 queued_execution ──claim fails revalidation──▶ denied  (reason: POLICY_CHANGED | AGENT_SUSPENDED | CREDENTIAL_REVOKED | ENV_HALTED)
 queued_execution ──grant TTL passes──▶ expired
```

Rules: transitions are enforced by a single `transition()` function and a database `CHECK` on allowed (from → to) pairs; terminal states never change; a direct `allow` is recorded as `approved` (by policy) then `queued_execution` in the same transaction so the audit shows authorization before queueing; `approved` is never reported as executed; `running` is written in the claim transaction.

---

## 5. Security model

### 5.1 Trust boundaries and what crosses them

| Boundary (from `SECURITY.md`) | Authenticates | Authorizes | Untrusted input |
|---|---|---|---|
| 1 Browser ↔ management-api | Managed OIDC login → server-side session cookie | Membership + role per request, in the database | All bodies, headers, ids |
| 2 n8n ↔ agent-api | Agent key (Bearer) | Agent status, environment, policy, per request | **Everything**, including parameters and any claimed tenant/agent |
| 3 API ↔ PostgreSQL | DB role per runtime | RLS + grants | n/a |
| 4 Human ↔ approval | Session + role + fresh digest | Approver rule (C7) | The digest the human saw is sent back and re-checked |
| 5 Executor ↔ mock CRM | Service token, executor only | Grant claim + re-evaluation | Stored canonical parameters only |
| 6 Services ↔ logs | n/a | Redaction | n/a |

**Authentication** answers who is calling (agent key, human session, executor identity); it grants nothing. **Authorization** is a separate decision on every request: agent active, environment active and matching, action in catalog, policy outcome, role. Tenant and agent are always derived from the credential, never read from a body, header or path.

### 5.2 Human roles (server-side, in the database)

| Capability | owner | admin | approver | viewer |
|---|:-:|:-:|:-:|:-:|
| View agents, policies, requests, audit | ✓ | ✓ | ✓ | ✓ |
| Approve / deny a request | ✓ | ✓ | ✓ | – |
| Create/edit policy | ✓ | ✓ | – | – |
| Register/suspend agent, issue/rotate/revoke credential | ✓ | ✓ | – | – |
| Halt / resume an environment | ✓ | ✓ | – | – |
| Invite member; set role ≤ own role | ✓ | ✓ (not owner) | – | – |
| Remove member / change owner | ✓ | – | – | – |

Hard rules: nobody changes their own role; the last owner cannot be removed or demoted; role changes are audited; **role labels in the UI grant nothing**. Whether owner and admin may approve is Q5.

### 5.3 Default deny and deterministic policy

- `evaluatePolicy({principal, action, resource, parameters, policies, now})` returns `deny | require_approval | allow` with reason code and matched policy version. Precedence `deny > require_approval > allow > implicit_deny`.
- Any thrown error, malformed policy, unknown effect, unknown field or unparsable condition is `deny` (`EVALUATOR_ERROR`), never skipped.
- V1 condition grammar: `{ all: [ { field, op, value } ] }`, `field` ∈ the action's schema properties, `op` ∈ `eq | neq | in | not_in | email_domain_in`. No regular expressions (ReDoS), no expressions, no scripting, no model calls. Policies referencing unknown fields fail at write time and at evaluation.
- Scope match: a policy applies if its environment is null or equal, and its agent is null or equal.

### 5.4 Credentials (agent keys)

- Format `axo_<env>_<keyId>_<secret>`: a recognisable prefix for secret scanners, a non-secret `keyId` for lookup, 256 bits of CSPRNG for the secret.
- Stored: `keyId`, `hash = HMAC-SHA-256(pepper_vN, secret)`, `hash_version`. The secret is returned **once**, in the creation response, with `Cache-Control: no-store`, and is never logged, audited, or placed in an error.
- Verification: lookup by `keyId`, constant-time compare, identical `401 UNAUTHENTICATED` for unknown, malformed, wrong-secret, expired and revoked keys (no oracle). Credential and agent state are read from the database on every request. **No caching** in V1, so revocation is immediate at the gate (S09).
- Rotation: issue a new credential, optionally leave the old one valid until a stated expiry (overlap), then revoke. Up to 2 active credentials per agent. Revoking a credential also fails pending requests it originated (accepted cost; Q7). Pepper rotation uses `hash_version` with a re-verify-on-login upgrade path.
- Pepper and any signing secrets come from environment/secret manager only; never in source, logs, or browser storage.

### 5.5 Human sessions and CSRF

Managed OIDC (Q3). Server-side session, `HttpOnly; Secure; SameSite=Lax` cookie, idle and absolute timeouts (proposed 30 min / 12 h; Q-config). Every state-changing management route requires: `Origin` check against an allow-list, `Sec-Fetch-Site` check, and a per-session CSRF token header. The approve request carries the **digest the reviewer saw**; a mismatch is rejected. Review text is rendered as escaped text, never HTML.

### 5.6 Tenant isolation

1. Every tenant table has `organization_id NOT NULL` and **composite foreign keys** `(organization_id, x_id)` so a child can never point at another organization's parent.
2. Repository functions take `organizationId` as a required argument; there is no unscoped `findById`.
3. Each request runs in a transaction that does `SET LOCAL app.organization_id = …`; every tenant table has `ENABLE` + `FORCE ROW LEVEL SECURITY` with a policy on that setting. The application roles are not table owners and do not have `BYPASSRLS`.
4. Cross-tenant probes return the same response as non-existent ids (S19).
5. The database is never exposed through a data API (for example a managed provider's auto-REST).

### 5.7 Replay, idempotency, expiry

- **Idempotency:** `UNIQUE(organization_id, agent_id, request_key)`; insert with `ON CONFLICT DO NOTHING`, then read. Same key + same digest → the existing request and status (including a prior denial). Same key + different digest → `409 IDEMPOTENCY_CONFLICT`. Key charset and length (16–128) are validated. Keys live as long as the request row.
- **Digest:** `SHA-256` of canonical JSON of `{v:1, action, resource, environment_id, parameters}` with sorted keys, NFC-normalized strings, no insignificant whitespace, strict flat string fields only (V1 schema). Email is lowercased at validation, before digesting. The executor always executes the **stored canonical parameters**, and recomputes the digest before executing; a mismatch fails closed.
- **Replay:** one grant per request, claimed once; second claim returns zero rows. Approvals are one-shot (`state` transition from `pending` only).
- **Expiry:** approval 15 min; direct-allow claim 5 min; grant 5 min after approval. Expiry is evaluated in SQL with `now()`, not in application code. A sweeper moves stale rows to `expired` for display, but correctness never depends on the sweeper (the claim predicate checks expiry itself).

### 5.8 Rate limiting and abuse bounds

- Auth-failure throttling per source IP and per `keyId`; per-agent request and poll limits; per-user limits on approvals and policy/credential changes.
- A shared limiter store is a beta prerequisite (Q10). M01 uses an in-memory implementation behind an interface, **and** database-enforced bounds that do not depend on any limiter: maximum pending approvals per agent, maximum body size (proposed 16 KiB), maximum JSON depth, maximum key and string lengths.
- Rate-limit rejections are `429` with `Retry-After`; they are never decisions and are not written to the tenant audit (to prevent audit flooding). They go to operational metrics.

### 5.9 Revocation semantics (precise)

| Event | New requests | Pending approval | Approved, not yet claimed | Claimed / `running` |
|---|---|---|---|---|
| Credential revoked | `401` immediately | Fails if it originated there | Blocked at claim | Cannot be recalled |
| Agent suspended | `403 AGENT_SUSPENDED` | Cancelled → `denied` | Blocked at claim; grant invalidated | Cannot be recalled |
| Agent revoked | as above, permanent | as above | as above | as above |
| Environment halted | denied | Stay pending; cannot be approved to execute | Blocked at claim | Cannot be recalled |
| Policy changed | New policy applies | Approver sees current policy result; approval does not override a new deny | **Re-evaluated at claim** | Cannot be recalled |
| Approver removed | n/a | Approval still valid if given before removal; audited | n/a | n/a |

"Immediate" means **at the next gate**. An execution already in flight when revocation happens may finish; its outcome is still recorded. The documentation and dashboard must say this.

### 5.10 Audit integrity and ordering

- `audit_events` rows are written in the same transaction as the state change. **Events:** `credential.issued/rotated/revoked`, `agent.registered/suspended/revoked`, `policy.version_created`, `environment.halted/resumed`, `membership.*`, `action_request.created/rejected_invalid`, `decision.recorded`, `approval.requested/approved/denied/expired/canceled`, `grant.created/invalidated/claimed`, `execution.started/succeeded/failed/unknown`.
- **Separate records** for authorization, reviewer decision and execution result, correlated by `action_request_id` and a trace id (S14).
- **Metadata contains no parameter values, no secrets, no raw headers.** Only ids, field names, digest, reason codes, versions.
- **Ordering:** `bigint GENERATED ALWAYS AS IDENTITY` plus `occurred_at` from `now()`. This orders inserts, **not** commit order across concurrent transactions; causal order within one request is carried by state-machine transitions. Do not describe the log as strictly ordered across the organization.
- **Integrity limits (to state publicly):** the application role has `INSERT` and `SELECT` only, plus a trigger rejecting `UPDATE`/`DELETE`. This stops application bugs and a compromised app role. **It does not stop a database superuser, the table owner, or someone with backup access.** There is no hash chain or external anchoring in V1, and **tamper-evidence must not be claimed** (`PHASE1-DECISIONS`).

### 5.11 Failure handling

| Failure | Behaviour |
|---|---|
| Database unavailable / timeout during request | `503 SERVICE_UNAVAILABLE`; no decision, no side effect. n8n treats anything other than `succeeded` as "not done". |
| Evaluator error or malformed policy | Recorded `denied` / `EVALUATOR_ERROR` (or `503` if it cannot be recorded). |
| Audit insert fails | Whole transaction rolls back; request is not authorized. |
| Executor cannot claim (DB down) | No execution. Request stays `queued_execution` until grant expiry, then `expired`. |
| Mock CRM unreachable *before* send | `failed`, attempt recorded. |
| Timeout or crash *after* send | Attempt `unknown`; **never retried automatically**; surfaced to a human. A sweeper marks stale `started` attempts `unknown`. |
| Executor retries | The downstream call carries `action_request_id` as its idempotency key; a duplicate returns the first result. |
| Pepper/secret missing at boot | Process refuses to start. |

---

## 6. n8n security architecture

```
n8n Agent ──(Bearer agent key, Idempotency-Key)──▶ agent-api
   ▲                                                  │ authenticate → derive org/agent/env
   │ status only                                      │ validate schema → canonicalize → digest
   │ (GET, same key)                                  │ evaluatePolicy (default deny)
   │                                                  ▼
   │                             denied │ pending_approval ──▶ human approver (management-api)
   │                                                  │ approve (role, not self, digest match)
   │                                                  ▼
   └─────────────── status ◀─── Postgres ◀── trusted executor
                                                      │ claim + re-evaluate + mark running (one txn)
                                                      ▼ service token (executor only)
                                                 mock CRM (protected destination)
```

How each requirement is met:

| Requirement | Mechanism | Verified by |
|---|---|---|
| Destination credentials unreachable by agents/n8n | Mock CRM service token exists only in the executor's environment; mock CRM is not routable from n8n's network and has no public route | S18 integration test: n8n-side call to the CRM → refused; code scan for the token in other roles' config |
| Agent cannot choose execution credentials | The request body has no credential, connector, URL or target field (strict schema, unknown keys → 422). The connector is bound to the catalog action in code (`crm.lead.create` → mock CRM) | Schema tests; catalog test |
| Enforcement cannot be bypassed via another route | Closed route registry: every route declares an auth class (`agent`, `human`, `executor`, `public`) and the test fails if a route has none or if a credential type is accepted on the wrong class. No grant or result routes exist. Agent keys are rejected on management routes and sessions on agent routes | Route-registry test; wrong-credential-type tests |
| Correct org, agent, action, resource | Derived from the credential; grant row linked by composite FKs; claim re-checks them against the request row and the stored digest | S02, S06, S09 tests |
| Unavailable policy service denies | No separate policy service in V1: the evaluator is in-process and the data comes from the same transaction; DB loss = `503`, no execution | S13 test (stop DB mid-flow) |
| Results recorded separately from approval | `execution_attempts` + `execution.*` audit events, distinct from `decisions` and `approval_requests` | S14 test |

**Honest limits to keep in product copy:** (1) an n8n administrator who holds the real CRM credential can bypass AgentAxio; (2) only actions routed through the executor are controlled; (3) n8n's own HITL is separate and does not count; (4) n8n's retry must reuse a stable `Idempotency-Key`; (5) n8n execution logs may retain parameters that n8n itself saw. AgentAxio cannot control that.

**Workflow contract for the demo:** HTTP Request → bounded poll → `IF status == succeeded` → proceed. Any HTTP error, timeout or non-`succeeded` status stops the workflow. No node may call the CRM directly.

---

## 7. Database design

### 7.1 Conventions

`uuid` primary keys (`gen_random_uuid()`), `timestamptz` everywhere, every tenant row has `organization_id`, composite unique `(organization_id, id)` on parents to support composite FKs, `CHECK` constraints for enums (text + CHECK, easier to migrate than native enums), no soft-deleted tenant data in V1 (status columns instead), `created_at default now()`.

### 7.2 Tables (V1)

| Table | Key columns and constraints | Change from `DATABASE.md` |
|---|---|---|
| `organizations` | id, name, slug UNIQUE | – |
| `users` | id (internal uuid), `auth_issuer`, `auth_subject`, email; UNIQUE(issuer, subject) | **Internal id**, subject separate (C-gap). Not tenant-scoped. |
| `memberships` | org, user, role CHECK(owner,admin,approver,viewer), status CHECK(active,removed); UNIQUE(org,user) | – |
| `invitations` | org, email, role, `token_hash` UNIQUE, expires_at, accepted_at, invited_by | **New** |
| `environments` | org, name, `enforcement_state` CHECK(active,halted), `policy_epoch` bigint; UNIQUE(org,name) | + kill switch, epoch |
| `agents` | org, environment (composite FK), owner_user_id, name, status CHECK(active,suspended,revoked); UNIQUE(org, environment, name) | `revoked` folded into status |
| `agent_credentials` | org, agent (composite FK), `key_id` UNIQUE, `secret_hash`, `hash_version`, created_by, expires_at, revoked_at, last_used_at | `scopes` **dropped** (an agent key can only call the two agent endpoints) |
| `action_definitions` | **global, no `organization_id`**: key, schema_version, status. Written by migration only; schemas live in `packages/contracts` | Global and code-owned (D8) |
| `policies` | org, environment nullable, agent nullable, action_key, `current_version_id` | Header row only |
| `policy_versions` | org, policy, version int, effect CHECK, condition JSONB, priority, enabled, created_by; UNIQUE(policy, version); **immutable** (no UPDATE grant) | **New** (C3) |
| `action_requests` | org, agent, environment, action_key, `request_key`, `canonical_digest`, `canonical_parameters` JSONB, resource, status CHECK, `originating_credential_id`, created_at, expires_at; **UNIQUE(org, agent, request_key)** | `safe_parameters` → full canonical parameters (C1) |
| `decisions` | org, request, result, `policy_version_id` nullable, `policy_epoch`, reason_code, decided_at; one row per evaluation (initial + each re-evaluation at claim) | + epoch; multiple per request allowed |
| `approval_requests` | org, request UNIQUE, assigned_role, state CHECK(pending,approved,denied,expired,canceled), expires_at, `decided_by`, `decided_at`, `decision_comment`, `reviewed_digest` | **`approval_votes` merged in** (single decision in V1) |
| `execution_grants` | org, request UNIQUE, digest, expires_at, `consumed_at`, `invalidated_at`, `invalidated_reason` | `nonce_hash` dropped (C4) |
| `execution_attempts` | org, grant, executor_id, target, state CHECK(started,succeeded,failed,unknown), external_reference, started_at, finished_at | – |
| `audit_events` | id bigint identity, org, occurred_at, actor_type, actor_id, event_type, object_type, object_id, request_id, trace_id, metadata_redacted JSONB | + trace_id, identity ordering |

**Deferred (no V1 use case):** `integrations` (the mock CRM is executor configuration; revisit with the first real connector), `outbox_events` (notifications are not in M01/M02), `approval_votes` (approval chains are post-beta).

### 7.3 Indexes and uniqueness

`UNIQUE(org, agent, request_key)` (idempotency) · `UNIQUE(execution_grants.action_request_id)` · `UNIQUE(agent_credentials.key_id)` · partial `INDEX ON agent_credentials (agent_id) WHERE revoked_at IS NULL` · `INDEX ON action_requests (org, status, created_at DESC)` · `INDEX ON approval_requests (org, state, expires_at)` · `INDEX ON policy_versions (org, policy_id, version DESC)` · `INDEX ON audit_events (org, occurred_at DESC)` and `(org, request_id)` · all foreign keys indexed. The "one pending approval flood" bound uses a partial index on `(org, agent_id) WHERE status = 'pending_approval'`.

### 7.4 Database roles and the credential lookup

| Role | Owns | May do |
|---|---|---|
| `axo_migrator` | schema, tables | DDL only; never used at runtime |
| `axo_agent_api` | – | `SELECT`/`INSERT` on requests, decisions, approvals, audit; `EXECUTE` on `auth.lookup_credential(key_id)`; no access to `execution_*` writes, no `UPDATE`/`DELETE` on audit |
| `axo_management` | – | membership, agents, credentials, policies, approvals; `INSERT` grants (in approval txn); `INSERT` audit |
| `axo_executor` | – | `SELECT` requests/policies; `UPDATE` grants (claim), `INSERT/UPDATE` attempts, `UPDATE` request status; `INSERT` audit; **cannot read** credentials or sessions |

`auth.lookup_credential(key_id)` is `SECURITY DEFINER`, `search_path` pinned, returns only `(credential_id, organization_id, agent_id, environment_id, secret_hash, hash_version, expires_at, revoked_at, agent_status, environment_state)`, and takes exactly one argument. It is the only way to resolve a tenant before RLS context exists.

### 7.5 Migration strategy

- Forward-only SQL migrations in `apps/api/migrations`, numbered, each with a test that applies it to an empty database and to the previous schema.
- **M01 migrations** = `DATABASE.md` 001–003 plus `audit_events`, with RLS, roles and grants in the same files (rather than a final 006). **M02:** approvals, grants, attempts. **Later:** integrations.
- Production migrations require explicit owner approval (`CLAUDE.md`). Seeds contain invented test organizations only.
- Migration tests: apply from empty; role grants are exactly the allow-list (query `information_schema`); RLS enabled and forced on every tenant table (a test enumerates tables and fails on a new tenant table lacking it); no table missing `organization_id` unless allow-listed.

---

## 8. API contract summary

All paths under `/v1`. JSON only (`415` otherwise). Every response carries a `trace_id`. Errors use one envelope:

```json
{ "error": { "code": "IDEMPOTENCY_CONFLICT", "message": "…", "trace_id": "…" } }
```

Messages are generic to external callers; detail lives in internal logs by `trace_id`.

### 8.1 Agent API (auth: `Authorization: Bearer <agent key>`)

| Method, path | Purpose | Success | Notable errors |
|---|---|---|---|
| `POST /action-requests` (`Idempotency-Key` required) | Propose an action. Body: `action`, `resource`, `parameters`. **No tenant, agent, environment or credential fields.** | `202 {id, status, reason_code?}` for `pending_approval` / `queued_execution`; `403 {id, status:"denied", reason_code}` for denial; a repeat returns the same | `401 UNAUTHENTICATED`, `403 AGENT_SUSPENDED`, `409 IDEMPOTENCY_CONFLICT`, `413`, `415`, `422 INVALID_REQUEST`, `429`, `503` |
| `GET /action-requests/:id` | Status for the **same agent only** | `200 {id, status, reason_code?, updated_at}` | `401`, `404 NOT_FOUND` (missing and foreign are identical), `429`, `503` |

The GET never returns parameters, grants, approver identity or execution internals. Reason codes (closed set): `POLICY_DENY`, `UNKNOWN_ACTION`, `HUMAN_REVIEW_REQUIRED`, `APPROVAL_DENIED`, `APPROVAL_EXPIRED`, `AGENT_SUSPENDED`, `CREDENTIAL_REVOKED`, `ENVIRONMENT_HALTED`, `POLICY_CHANGED`, `EVALUATOR_ERROR`, `EXECUTION_FAILED`, `OUTCOME_UNKNOWN`.

### 8.2 Management API (auth: session cookie + CSRF; role checked server-side)

`POST /agents` · `GET /agents` · `POST /agents/:id/suspend` · `POST /agents/:id/resume` · `POST /agents/:id/revoke` · `POST /agents/:id/credentials` (plaintext once) · `POST /agents/:id/credentials/:cid/revoke` · `GET|POST /policies`, `POST /policies/:id/versions` · `GET /approvals` · `GET /approvals/:id` · `POST /approvals/:id/approve` and `/deny` (body must include `reviewed_digest`) · `POST /environments/:id/halt` and `/resume` · `GET /audit-events` (filters, cursor pagination) · `GET|POST /members`, `POST /invitations`, `POST /invitations/:token/accept`.

Management routes are delivered in M02, after the human-auth decision (Q3). Exact shapes will come from the generated OpenAPI document (`CLAUDE-MILESTONE-01`).

### 8.3 Not exposed

No grant, claim, execution-result, mock-CRM or token-exchange route exists on any web-facing role.

---

## 9. Threat model

Extends `SECURITY.md`. "Residual" = what remains after the control.

| # | Threat | Boundary | Control | Residual / owner |
|---|---|---|---|---|
| T1 | Stolen or guessed agent key | 2 | 256-bit secret, peppered HMAC, revocation checked per request, throttling, `axo_` prefix for secret scanning | A leaked live key can propose actions until revoked. Policy still gates. |
| T2 | Key/credential enumeration and timing | 2 | Same `401` for all failures; constant-time compare; auth-failure throttling | – |
| T3 | Cross-tenant read/write (IDOR) | 1, 2 | Server-derived tenant, mandatory `organizationId`, composite FKs, forced RLS, identical 404 | Review of the `SECURITY DEFINER` function (external) |
| T4 | Parameter tampering after approval | 4, 5 | Immutable params, digest in approval (`reviewed_digest`) and re-verified at claim | – |
| T5 | Replay of approval or grant | 4, 5 | Atomic single-use claim, one grant per request, one-shot approval transition | – |
| T6 | Duplicate execution via retry or race | 2, 5 | Idempotency unique key; claim race has one winner; downstream idempotency key; `unknown` never auto-retried | Genuine downstream duplication if the CRM ignores idempotency (mock CRM will honour it) |
| T7 | Stale authority (revoked/changed after approval) | 5 | Re-evaluate and re-check agent, credential, environment inside the claim transaction | In-flight execution cannot be recalled |
| T8 | Self-approval and collusion | 4 | Approver rule C7; role matrix; audited | Two colluding humans are out of scope |
| T9 | Policy-editor abuse (writes an allow, then approves) | 1 | Policy edits are immutable and audited; editor/approver separation is **not enforced** in V1 | Accept for V1 or add Q5 rule |
| T10 | Privilege escalation via roles/invitations | 1 | Hard rules in 5.2; invitation tokens hashed, single-use, expiring, bound to email | – |
| T11 | CSRF or phishing of approvals | 1, 4 | Origin + Sec-Fetch + CSRF token; exact preview; digest echo | Social engineering of approvers |
| T12 | Stored XSS from agent-supplied text on the review screen | 1 | Escaped text rendering only; CSP in the web app | Needs external review |
| T13 | Secrets in logs, errors, audit | 6 | Redaction layer with allow-listed log fields; audit metadata schema; secret-scan CI; log-capture tests | Third-party platform logs are out of our view |
| T14 | Audit tampering | 3 | Append-only role + trigger | Superuser/owner/backup access can alter. Not tamper-evident (5.10). |
| T15 | Audit/queue flooding (DoS) | 2 | Rate limits, pending caps, body limits; rate-limit events not audited | Needs load testing before beta |
| T16 | Dependency/supply-chain | all | Lockfile, frozen installs, dependency scan, install scripts denied by default (already set) | External for beta |
| T17 | SQL injection | 3 | Parameterized queries only; Kysely; lint rule against string-built SQL | – |
| T18 | SSRF | 5 | No caller-supplied URLs; the connector target is fixed in code | Revisit with the first real connector |
| T19 | n8n admin or agent with direct downstream credential | 5 | **Not preventable.** Credentials stay out of n8n; stated in docs | Accepted, disclosed |
| T20 | Prompt injection of the agent | 2 | Policy is deterministic and independent of any model; strict schema | Agent may still *propose* harmful but in-policy actions; approval is the control |
| T21 | Clock skew | 3 | Database time only | – |
| T22 | Pepper/DB-credential compromise | 3 | Secret manager, separate secrets per role | Key-management provider is Q8 |

---

## 10. Security testing strategy

### 10.1 Test layers

- **Unit (`packages/policy`, `packages/contracts`):** precedence and exhaustive effect combinations (property-based), malformed policy → deny, canonicalization stability (key order, Unicode, whitespace), digest sensitivity to every field, schema strictness.
- **Integration against real PostgreSQL (not mocks):** auth, idempotency, state machine, RLS, role grants, concurrency, migrations, fail-closed (stop the database, kill the process mid-claim).
- **End-to-end (M03):** exported n8n workflow against the stack, including negative runs.
- **External (cannot be self-certified):** see 10.3.

### 10.2 Requested coverage mapped to acceptance criteria

| Area | Tests (illustrative) | S-criteria | Level |
|---|---|---|---|
| Unauthorized requests | missing/malformed/expired/revoked key → 401, CRM unchanged; agent key on management route; session on agent route | S01, S16 | integration |
| Cross-tenant | org A key reads/creates/approves/executes org B ids; `organization_id` in body ignored; composite FK rejects cross-org insert; RLS with unset/forged setting returns zero rows; ID fuzz | S02, S19 | integration + fuzz |
| Environment isolation | dev key cannot touch prod policy or requests | S03 | integration |
| Privilege escalation | viewer approves; approver edits policy; admin self-promotes; last-owner removal; invitation reuse/ wrong email | S16 | integration |
| Revoked credentials | revoke before/after approval, before claim | S01, S09 | integration |
| Suspended agent / halted environment | pending cancelled, grant invalidated, claim refused | S09 | integration |
| Expired approvals / grants | advance DB time (test hook that sets a fake clock **in tests only**, or short TTL config) | S08 | integration |
| Replay | 20 concurrent claims on one grant → ≤1 winner, ≤1 mock-CRM write; re-approve an approved request | S11 | integration (real DB) |
| Duplicate execution requests | same key/same payload → same id; concurrent first submissions; same key/different payload → 409; executor retry after crash → `unknown`, no second write | S12 | integration |
| Invalid policy decisions | malformed condition, unknown effect/field, evaluator throws → deny; new deny after approval blocks claim | S04, S05, S10 | unit + integration |
| Payload integrity | change one parameter/resource after approval; stored-row tampering detected by digest recheck | S06 | integration |
| Fail-closed | DB stopped → 503 and zero writes; audit insert forced to fail → request not authorized; mock CRM down; pepper missing at boot | S13 | integration |
| Audit consistency | one request produces correlated, distinct `decision`, `approval`, `execution` events; no event without state change and vice versa; app role cannot `UPDATE`/`DELETE`; ordering within a request | S14 | integration |
| Credential exposure | secret appears once in the creation response; never in logs (log-capture test on every route incl. failures), audit, errors, `GET` bodies; hash-only at rest; `no-store` header; repo secret scan | S15 | integration + CI scan |
| Input hardening | unknown keys, 17 KiB body, deep nesting, invalid email, non-canonical resource, SQL/HTML-looking strings stored as data | S17 | unit + integration |
| Mock-CRM exclusivity | n8n-side network path to CRM refused; token only in executor config | S18 | integration |
| Route registry | every route declares an auth class; no grant/result routes exist | S01, S18 | unit |
| Migrations & grants | apply from empty; exact role privilege allow-list; RLS forced on all tenant tables; new table without `organization_id` fails the test | S20 | CI |
| Quality | strict TS, lint, tests, migration tests green in CI with a Postgres service container | S20 | CI |

### 10.3 What needs integration tests versus external validation

| Needs real-database integration tests | Cannot be proven by our tests (external or operational) |
|---|---|
| S02, S03, S11, S12, S13, RLS, role grants, migrations | Independent penetration test and architecture review (Gate 3) |
| S09, S10 (state and race behaviour) | Review of the `SECURITY DEFINER` lookup and RLS configuration by a database-security reviewer |
| S14 consistency | Secrets-management and KMS/pepper handling in the hosting environment (Gate 2) |
| S15 (log capture) | TLS termination, CORS, headers, cookie flags on the **deployed** system |
| S17, S19 | Backup and **restore** drills; superuser/backup access controls (audit-integrity limits) |
| | Rate limiting across multiple instances and under load |
| | OIDC provider configuration, session settings and account-recovery paths |
| | Dependency/vulnerability scanning in the real pipeline; incident response; retention and legal review |

Per `SECURITY-ACCEPTANCE.md`, AI-generated test reports never substitute for the independent assessment.

### 10.4 Acceptance checklist for approving BE-01A (this review)

- [ ] Contradictions C1–C9 resolved or ruled on
- [ ] Open questions Q1–Q3 answered (blockers); Q4–Q14 answered or deferred with a date
- [ ] DB-schema amendments in 7.2 approved (including the deferrals)
- [ ] Decision to proceed to the M01 slices in section 11

---

## 11. Backend implementation plan

Slices are small, reviewable pull requests, each with its threat impact and the tests run (per `CLAUDE.md`). Each slice keeps the frontend untouched, uses invented seed data, and ends with the S-criteria it satisfies.

**M01 — Authorization core (local only; no human auth, no execution, no downstream side effect)**

| Slice | Content | Done when |
|---|---|---|
| B0 | Workspace additions: `apps/api`, `packages/policy`, `packages/contracts`; strict TS, ESLint, Vitest; Postgres 17 service in CI; `.env.example`; secret scan; docker-compose (needs Q2) | Fresh clone installs, DB up, CI green |
| B1 | Contracts + pure `evaluatePolicy` + canonicalization/digest + reason codes | Policy unit/property suite green; S04, S05 (unit) |
| B2 | Migrations 001–003 + `audit_events`, roles, RLS, `lookup_credential`; migration + grants tests | RLS/role/migration tests green; S02 (DB level), S20 |
| B3 | Credential generation/hash/verify, rotation/revocation (library + CLI seed), auth middleware, route registry test | S01, S15 (unit/integration) |
| B4 | `POST/GET /v1/action-requests`, idempotency, state transitions to `denied` / `pending_approval` / `queued_execution`, audit in-transaction, fail-closed 503 | S01–S05, S12, S13, S17, S19 |
| B5 | Negative-suite completion (≥20 abuse cases), OpenAPI document, threat note listing M02 blockers | M01 definition of done; **review gate** |

**Progress:** B0 done (`d9a2ecd`). B1 done: closed vocabularies and state machine, strict `crm.lead.create` schema, canonical JSON and digest, policy condition grammar (`packages/contracts`), and the pure `evaluatePolicy` (`packages/policy`) with 82 unit and property tests. B2 onward not started.

Agents and policies are created by a **local seed/CLI script** in M01 (no management API, no human sessions).

**M02 — Humans, approvals, grants, trusted mock executor** (blocked on Q3)

| Slice | Content | Criteria |
|---|---|---|
| M02a | Human auth (provider per Q3), sessions, CSRF, memberships, invitations, role matrix, management endpoints for agents/credentials/policies | S16 |
| M02b | Approval queue, approve/deny with `reviewed_digest`, self-approval rule, approval TTL, grant creation | S06, S07, S08 |
| M02c | `apps/mock-crm`, executor (claim + re-evaluate + attempts), `unknown` handling, suspend/revoke/halt semantics | S09, S10, S11, S14, S18 |

**M03 — n8n demonstration:** exported workflow, curl guide, negative runs, wiring the existing dashboard to real endpoints (the frontend changes only then, by a separate approved task). Needs all S01–S20.

**Gates (unchanged):** no real credentials, data, deployment, billing or production migration without explicit owner approval. Private beta needs the Gate 2 items; sensitive production needs Gate 3.

---

## 12. Open questions requiring founder approval

| # | Question | Recommendation | Blocks |
|---|---|---|---|
| **Q1** | The brief excludes "agent creation". Does that mean AgentAxio never builds or hosts AI agents (only *registers* an identity record for an agent that runs elsewhere), or that even registering agents is out of the first backend? | The first reading. Registration stays: it is the identity every credential and policy attaches to. | M01 scope |
| **Q2** | Docker and PostgreSQL are not installed on this machine. Install Docker Desktop (as `CLAUDE-MILESTONE-01` assumes), install PostgreSQL natively, or use a hosted dev database? | Docker Desktop. A hosted database would put test data off-machine. An in-memory Postgres substitute is not acceptable for the S11/RLS/role tests. | B0 |
| **Q3** | Human-authentication provider: managed OIDC (Supabase Auth is named in `ARCHITECTURE`) or another provider? | Decide before M02a, not M01. Keep the schema provider-neutral (`auth_issuer`, `auth_subject`) so the choice is reversible. If Supabase Auth is chosen, still do not expose the database through its data API. | M02a |
| Q4 | Define "self-approval" for agent-originated requests (C7). | Approver ≠ agent owner and ≠ the user who issued the originating credential. | M02b |
| Q5 | May `owner`/`admin` approve, or only `approver`? Should a policy editor be barred from approving requests under their own newest policy (T9)? | Owner/admin/approver may approve; editor/approver separation deferred and disclosed. | M02b |
| Q6 | Suspend vs revoke semantics (C8). | As in C8. | M02c |
| Q7 | Revoking/rotating a credential fails pending requests it originated. Acceptable? | Yes; recommend overlap rotation to avoid it. | M02c |
| Q8 | Key-management and secrets provider, and column encryption of `canonical_parameters`. | Decide before external beta (Gate 2). Local pepper from environment for M01. | Beta |
| Q9 | Retention for `canonical_parameters` after a terminal state, and audit retention/erasure. | Proposal: reduce parameters to the digest after N days; N and the legal basis are the founders' and counsel's call. Never erase audit without an approved policy. | Beta |
| Q10 | Rate-limit store (shared) for multi-instance deployment. | Decide at hosting selection; in-memory plus DB bounds until then. | Beta |
| Q11 | TTL values: approval 15 min, direct-allow claim 5 min, grant 5 min after approval. | Accept as config defaults. | M02b |
| Q12 | Schema-invalid input is `422` with no stored row (C6). | Accept. | B4 |
| Q13 | Approve the DB amendments: global code-owned action catalog, immutable `policy_versions`, merged approval decision, dropped nonce and `scopes`, deferred `integrations`/`outbox`, new `invitations`, environment halt. | Accept. | B2 |
| Q14 | Framework picks: Fastify + Zod + Kysely + SQL migrations (D2, D3). | Accept; low-stakes, reversible before B0. | B0 |

---

*This document describes a proposal for a local-first, mock-target prototype. It does not claim that AgentAxio is secure, certified, or independently assessed.*
