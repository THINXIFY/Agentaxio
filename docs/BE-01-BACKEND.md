# BE-01 — Backend as built (M01, local only)

Status: implemented on branch `be-01-backend-foundation`, **local only**. Nothing is deployed, no production data exists, no real credential is used. This document describes what the code does today and where it stops. It is not a claim that AgentAxio is secure for production use; it has had no independent assessment (`docs/SECURITY.md` gates 2 and 3 are not reached).

Companion documents: `docs/M01-ACCEPTANCE.md` (every S-criterion, with its tests and status), `docs/BE-01A-ARCHITECTURE-REVIEW.md` (the approved design), `docs/BE-01-B1-SECURITY-REVIEW.md` (review of the pure policy code).

## 1. What M01 does, and does not do

**Does:** authenticate an agent by its key; derive organization, agent and environment from the database; validate the proposed action strictly; evaluate the organization's current policies deterministically (default deny); record the request, the decision and the audit trail in one transaction; answer with `denied`, `pending_approval` or `queued_execution`; let the agent poll its own request. Separately, let owners and admins register agents, issue/rotate/revoke credentials, create and revise policies, suspend/resume/revoke agents and halt/resume an environment.

**Does not:** approve anything, issue grants, execute anything, call any downstream system, authenticate human users, send notifications, rate-limit by client, or encrypt stored parameters. `queued_execution` means "authorized by policy and waiting for an executor that does not exist yet". Authorized is never executed.

## 2. Run it

Requires Node 22+, pnpm, and either Docker (the supported path) or any PostgreSQL 17 reachable by a superuser.

```
corepack pnpm install
cp .env.example .env                   # set POSTGRES_PASSWORD to something random (repository root)
docker compose up -d                   # PostgreSQL 17 on 127.0.0.1:5432 only
corepack pnpm --filter @agentaxio/api db:setup     # roles with random passwords, hardened database, apps/api/.env
corepack pnpm --filter @agentaxio/api db:migrate
corepack pnpm --filter @agentaxio/api db:seed      # invented organization + mock agent; prints the agent key ONCE
corepack pnpm --filter @agentaxio/api dev          # http://127.0.0.1:8787
corepack pnpm test                                 # all workspaces; the API tests use a real PostgreSQL 17
```

`db:seed` prints the `curl` command to try. Without Docker the tests still run: they start a real PostgreSQL 17 from the `embedded-postgres` dev dependency (an ordinary user process; nothing is installed system-wide). The Docker route (`docker compose` + `db:setup`) could not be run on the machine this was built on (Docker is not installed there); the same `db:setup` code is exercised against a real PostgreSQL server in `test/cli.test.ts`.

## 3. Components

| Part | Path | Role |
|---|---|---|
| Vocabularies, strict action schema, canonical JSON, digest, policy grammar | `packages/contracts` | Shared by everything; pure |
| Policy evaluator | `packages/policy` | Pure, deterministic, fails closed |
| Migrations, runner | `apps/api/migrations`, `src/db/migrate.ts` | Schema, RLS, grants, guards |
| Agent authentication, authorization transaction, status | `apps/api/src/authorization` | The data plane |
| Credentials | `apps/api/src/credentials` | Generate, parse, hash, verify |
| Management operations | `apps/api/src/management` | Agents, credentials, policies, environments |
| HTTP | `apps/api/src/http/app.ts` | Two routes; fail-closed errors; no secrets in logs |
| Local tooling | `apps/api/src/cli`, `sql/` | setup, migrate, seed, dev |

### Database roles (`sql/bootstrap-roles.sql`)

| Role | Used by | Can do |
|---|---|---|
| `axo_migrator` | `db:migrate`, `db:seed` only | Owns the schema; never used by a running service |
| `axo_agent_api` | the agent API | Read and create **its own agent's** requests and decisions; read policies that can apply to it; append audit events as itself; move its own request from `approved` to `queued_execution`. Nothing else: no audit read, no credentials, no deletes |
| `axo_management` | management operations | Read its organization (any member role); write agents, credentials, policies, environments only as owner/admin; cannot read credential digests |

None is a superuser, can create roles/databases/objects, or bypasses row-level security. `test/database.test.ts` asserts the exact privilege list of each role (every table, every updatable column, every function) and fails if it changes.

## 4. Tenant isolation: four independent layers

1. **Identity comes from the database, never the request.** An agent request carries only a key. `axo.lookup_credential` finds the credential by its public key id; the secret is verified in constant time; then `axo.enter_agent_context` derives organization, agent and environment from rows and sets the transaction-local context that row-level security reads. No organization id from a request body, header or URL is ever used as proof of tenancy. A human operation names an organization, but `axo.enter_management_context` proves in the database that the user is an active member of it before anything else runs.
2. **Row-level security** on every tenant table, for each runtime role, keyed to that context (an agent also only sees its own agent's rows). No context means no rows.
3. **Composite foreign keys** `(organization_id, id)` everywhere, so a row can never reference another organization's row even when written by the table owner (tested: agent↔environment, credential↔agent, policy↔agent/environment, request↔agent/environment).
4. **Application code** passes the organization explicitly and treats another organization's ids as nonexistent.

Not provided: protection against a **compromised agent-api process** that runs arbitrary SQL. A database role cannot be stopped from calling `set_config`, so such a process could choose its own tenant context (documented by an explicit test). Row-level security defends against application bugs, not that attacker; limiting that blast radius is a deployment matter (network isolation, custody of the role's password).

## 5. The authorization transaction

`POST /v1/action-requests` runs as one READ COMMITTED transaction:

1. Parse the bearer key; look it up; verify the secret in constant time (same work and same answer for unknown, malformed, wrong, revoked, expired and revoked-agent keys).
2. `axo.enter_agent_context` takes locks in a fixed order (environment shared, agent exclusive, credential shared), sets the context, and returns state **after** locking.
3. Validate the `Idempotency-Key` and body with `packages/contracts` (strict schema, one resource, no tenant/agent/credential fields). Invalid input is rejected with field paths only and leaves an audit event without the payload.
4. If the key was used before: identical payload digest returns the original answer; different digest is `409`.
5. Load the **current, enabled** version of each policy that can apply (bounded, ≤ 500), evaluate with `evaluatePolicy` (deny > require_approval > allow > implicit deny; any error is a recorded denial `EVALUATOR_ERROR`), or deny directly for an unknown action or a halted environment.
6. Insert the request (canonical parameters and digest), the decision (policy version, policy epoch, matched versions), and the audit events. An allow is first `approved` then `queued_execution` (legal transitions, enforced by a trigger).
7. Commit. If anything above fails, including the audit insert, nothing is written and the caller gets `503`.

**Why READ COMMITTED with locks, not SERIALIZABLE:** the lock order environment → agent → credential has no cycles, waits are bounded (`lock_timeout` 3 s, then fail closed), and there are no abort/retry loops to get wrong. Consequences, each tested: a policy edit waits for in-flight decisions and each decision sees a matching (policy epoch, policies) pair; suspending an agent waits for its in-flight decisions and then withdraws everything still waiting; requests from one agent are serialized, which makes idempotency and the pending-request cap exact (throughput is per agent, acceptable for V1).

## 6. Credentials

Format `axo_<24 hex key id>_<43 base64url secret>`: 256 random bits. Stored: the key id (a public handle) and `HMAC-SHA-256(pepper, secret)`. A fast keyed hash is right because the secret is high-entropy; the server-side pepper means a copy of the database alone cannot verify guesses. The key is returned once from the call that creates it and exists nowhere else (tested across every table and the logs). Rotation issues the new credential and revokes the old one atomically; up to two credentials may be active (database trigger) to allow an overlap. Revoking a credential, or suspending/revoking an agent, takes effect at the next request and withdraws the requests still waiting (`denied`, with a decision row and an audit event each). An execution already running cannot be recalled (M02 concern).

The service refuses to start without `AXO_CREDENTIAL_PEPPER` (≥ 32 random bytes).

## 7. Policy management

A policy header fixes its action, optional environment and optional agent and never changes. Behaviour lives in numbered, immutable versions; editing or disabling inserts the next version. The caller states the version it believes is current; a database trigger serializes writers and refuses a stale or skipped number (tested with 8 simultaneous revisions: one wins). Every new version bumps the `policy_epoch` of each environment it can affect, in the same transaction. Conditions use only the fixed grammar from `packages/contracts` (no regular expressions or scripting) and are validated with the same code the evaluator uses before they are stored.

## 8. Database

14 tables in schema `axo`: `organizations`, `users`, `memberships`, `environments`, `agents`, `agent_credentials`, `action_definitions` (global, code-owned catalog), `policies`, `policy_versions`, `action_requests`, `decisions`, `audit_events`, `request_status_transitions`, `schema_migrations`. Four forward-only migrations (`001_tenancy`, `002_agents_credentials`, `003_policies`, `004_requests_decisions_audit`).

- **Append-only:** `decisions`, `policy_versions`, `policies`, `audit_events` reject UPDATE, DELETE and TRUNCATE by trigger (also for the owner) and have no such grant. `action_requests` may change only `status`, only along the 12 legal transitions (the table is checked equal to `allTransitions()` by a test), and a request cannot be created in an executing or finished state.
- **Time:** expiry is evaluated with the database clock at read time, never by a background job.
- **Indexes:** every foreign key, plus `(org, status, created_at)`, per-agent status, active credentials, audit by organization/time and by request.

### Migration and rollback strategy

Migrations are forward-only, each in one transaction with its bookkeeping row (all or nothing), checksummed (editing an applied migration is an error), applied in order under an advisory lock (concurrent runners serialize), and run by the owner role only. There are deliberately **no down migrations**: undoing a security-relevant schema change by script is how constraints get dropped by accident. Recovery is a new forward migration, or restoring a backup taken before the change. Applying migrations to any real database requires explicit owner approval (`CLAUDE.md`). All of this is tested (empty-database apply, re-run, tamper, out-of-order, half-failure, 4 concurrent runners).

## 9. Defects found by the tests while building this

Recorded because they are exactly the class of mistake the tests exist to catch:

- **PUBLIC could execute every function.** A schema-scoped `ALTER DEFAULT PRIVILEGES … REVOKE` does not remove PostgreSQL's built-in grant, so an agent connection could call the management entry point. Fixed with a database-wide default revoke plus a sweep; the privilege matrix test now guards it.
- **A dropped connection would have crashed the service** (unhandled client error event on a checked-out connection). Handled per checkout.
- **The test runner exited 0 when tests failed**, because the embedded-server library's exit hook overrides the exit code. That would have let CI pass with failing tests. The server now runs in its own process; the exit code is verified.
- **`text/plain` bodies were parsed by default.** Only `application/json` is accepted now.
- A viewer attempting an update received a misleading not-found/conflict because row-level security filtered the row; the role is now checked first and reported as `FORBIDDEN`, with the database still enforcing independently.

## 10. Deviations from the approved design (all conservative)

| Approved | Built | Why |
|---|---|---|
| Kysely for queries (Q14) | Plain parameterized `pg` queries in small modules | The brief asked for minimal dependencies; every query is a fixed string with bind parameters |
| RLS `ENABLE` + `FORCE` | `ENABLE` only | The two `SECURITY DEFINER` entry points must read across tenants and are owned by the table owner. Runtime roles never own tables (tested) |
| Pending-approval cap as a DB-level bound | Enforced in the transaction under the agent lock | Exact because requests per agent are serialized; also covered by a test that fills it |
| `approval_requests`, `execution_grants`, `execution_attempts` | Not created | M02 |

## 11. Known limitations and unresolved issues

- **No human authentication (open decision Q3).** Management operations take a `userId` from a trusted caller and the database verifies membership and role for that id, but it cannot verify that the caller really is that person. Until M02 adds sessions, only trusted code (seed, tests) may call them, and the `axo_management` password is as powerful as every member's identity.
- **No client throttling (Q10).** Bounded by body size (16 KiB), timeouts, lock timeouts and the per-agent pending cap only. There is no login-style lockout; guessing a 256-bit secret is infeasible, but unknown key ids are cheap to probe.
- **Audit flooding.** An authenticated agent can create unlimited `rejected_invalid` audit events.
- **Audit is append-only for the application, not tamper-evident.** A superuser or the table owner can disable triggers or alter rows; there is no hash chain or external anchor, and none is claimed.
- **Personal data at rest.** `canonical_parameters` holds submitted values in clear text until a retention job exists (Q9); there is no column encryption or key management yet (Q8). Values are kept out of logs, audit metadata, error bodies and decisions (tested).
- **Duplicate JSON keys** are resolved last-wins by the parser before validation; the value that is digested, reviewed and executed is that single value.
- **TLS** is not handled by the service; deployment must terminate it, and database connections here are local and unencrypted.
- **Independent review, dependency scanning in CI, backup/restore drills, monitoring** (gate 2) are not done.
- **The CI workflow changes have not run on GitHub** (nothing is pushed). Linux behaviour of the embedded test server is unverified; CI uses PostgreSQL service containers instead.

## 12. Blockers for M02

Human authentication provider and sessions (Q3); approvals with the reviewed-digest echo and the self-approval rule (Q4/Q5); grants and the executor role with a single atomic claim that **re-evaluates policy and re-checks agent/credential/environment in the claim transaction** (a request allowed at submission that now requires approval has no approval and must be denied); the mock CRM as a separate service reachable only by the executor (S18); client throttling store (Q10); retention and encryption decisions (Q8/Q9); reviewer/execution audit events.
