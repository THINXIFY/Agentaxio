# M01 acceptance — what is proven, what is not

Scope of M01 (`docs/CLAUDE-MILESTONE-01.md`): tested policy decisions and tenant isolation, locally. The release gate for the **local slice** (`docs/SECURITY-ACCEPTANCE.md`) is **S01–S05, S12, S13, S17, S20 plus policy tests**. The other criteria belong to later milestones; they are listed so nothing is implied.

All integration tests run against a real PostgreSQL 17 server. Nothing in the database layer is mocked.

**Verdict:** the local-slice gate is satisfied **on the machine this was built on**. Two things stop me from calling M01 fully closed: the CI workflow has not yet run on GitHub (nothing is pushed), and the documented Docker route has not been run (Docker is not installed there). This is a local prototype, not a security approval and not production-ready.

## Local-slice gate

| ID | Requirement | Status | Where it is tested |
|---|---|---|---|
| S01 | No anonymous execution | **Satisfied** (M01 has no execution path at all; it only decides) | `http.test` "S01 …" (8 failure kinds, identical answers, nothing written, body unread); `credentials.test` "S01 treats every kind of bad credential identically"; route table has exactly 2 routes, both authenticated |
| S02 | Tenant isolation | **Satisfied** for every implemented operation (agent API, agent/credential/policy/environment management). Approve/execute do not exist yet | `database.test` "S02 row-level security isolates tenants", composite-FK test; `management.test` "S02 management cannot reach another organization's objects"; `credentials.test` "a key issued in one organization never acts in another" |
| S03 | Environment isolation | **Satisfied** | `authorization.test` "S03 environment isolation"; `management.test` halt isolation; composite foreign keys |
| S04 | Default deny | **Satisfied** | `authorization.test` "S04 default deny", "S04 unknown action"; `failclosed.test` "S04 evaluator errors and corrupt policy"; `packages/policy` (54 tests) |
| S05 | Deny precedence | **Satisfied** | `authorization.test` "S05 deny precedence", approval-not-bypassed; policy package property tests |
| S12 | Idempotency | **Satisfied** | `authorization.test` "S12 …" (same key/payload, changed payload → conflict, 20 parallel identical → one row); `http.test` (20 parallel over HTTP, replay header) |
| S13 | Outage fails closed | **Satisfied** for what M01 does | `failclosed.test`: audit-write failure rolls back the whole decision (and a policy edit); database unreachable; connection killed mid-decision; lock wait beyond timeout; `http.test` 503 body leaks nothing |
| S17 | Input hardening | **Satisfied** | `contracts` tests (unknown keys, tenant claims, Unicode, size, depth, `__proto__`); `http.test` "S17 …" (422/413/415, no values in issues); injection text stored as data |
| S20 | Quality gate | **Satisfied locally**: strict TypeScript, ESLint (type-checked strict), Prettier, all tests, migration tests. **CI configured but not yet observed running** | `pnpm check`; `.github/workflows/ci.yml` (PostgreSQL 17 service containers) |

## Criteria that belong to M02/M03 (not satisfied, not claimed)

| ID | Requirement | M01 status |
|---|---|---|
| S06 | Payload integrity after approval | **Partial.** Parameters and digest are immutable in the database (trigger, tested); a changed payload under a used key is a conflict. "After approval" needs approvals (M02) |
| S07 | No self-approval | Not applicable yet; no approvals exist |
| S08 | Expiry of approval and grant | **Partial.** Request expiry is reported from the database clock without a sweeper (tested); approval/grant expiry is M02 |
| S09 | Revocation immediate at the gate | **Satisfied for the M01 gate** (new requests and waiting requests; tested with concurrent races). The claim-time check is M02 |
| S10 | Policy changes invalidate stale grants | Not applicable yet; the policy epoch and version are recorded on every decision and read as a matching pair under concurrency (tested). Re-evaluation at claim is M02 |
| S11 | Replay on a grant | Not applicable yet (no grants). Request-level replay is S12 |
| S14 | Audit fidelity | **Partial.** Request, decision, queueing and withdrawal are separate, correlated records (tested); no parameter values (tested). Reviewer vote and execution result are M02 |
| S15 | Secret hygiene | **Satisfied for what exists:** key shown once, digest only at rest, absent from every table, audit and log line (tested). "Not in the browser" is vacuous: no UI shows keys |
| S16 | Role permissions | **Partial.** Owner/admin may write, approver/viewer may not, for every implemented operation, in application code and independently in the database (tested). No runtime role can write memberships at all (privilege matrix). "Approver cannot grant own admin access" needs membership management (M02) |
| S18 | Mock execution uniqueness | Not applicable yet; there is no mock CRM or executor |
| S19 | Status access | **Satisfied.** Foreign, sibling, missing and malformed ids all give the identical 404 (`http.test` "S19 status access"); row-level security restricts an agent to its own rows |

## Milestone definition of done (`CLAUDE-MILESTONE-01.md`)

| Item | Status |
|---|---|
| Monorepo, strict TypeScript, ESLint, formatter, Vitest, local PostgreSQL, env example | Done. Docker Compose file exists; not run here (see verdict) |
| Validated schemas: `crm.lead.create`, agent identity, resource, decision outcomes, typed reason codes | Done (`packages/contracts`) |
| Pure deterministic `evaluatePolicy` | Done (B1, reviewed in `BE-01-B1-SECURITY-REVIEW.md`) |
| First migration: organizations, memberships, environments, agents, credentials (hashes), actions, policies, requests, decisions, audit | Done: 4 migrations |
| Minimal API: scoped key auth and `POST /v1/action-requests`; org-derived identity and idempotency; no downstream side effect | Done, plus `GET /v1/action-requests/:id` |
| Seed data: invented organizations and a mock agent only | Done (`db:seed`; refuses non-development databases) |
| CI and ≥ 20 focused tests incl. cross-org, expired/revoked keys, unknown actions, deny precedence, malformed payload, stable retries, changed-payload conflict | Tests: far above 20 (see below), all named cases covered. CI not yet run on GitHub |
| OpenAPI sketch, test output, short threat/architecture note listing M02 blockers | `apps/api/openapi.json` (checked against the running routes by a test); `docs/BE-01-BACKEND.md` section 12 |
| Fresh clone → install → migrate → seed → test → exercise the API documented and reproducible | Documented in `docs/BE-01-BACKEND.md`; the setup→migrate→seed→serve→request path is automated in `test/cli.test.ts` over a real socket |
| No keys in the repository | `.gitignore`, CI secret scan; placeholders only in tracked env files |
| No browser demo implies real security; no deployment or production data | Frontend unchanged; nothing deployed |

## Test counts at the time of writing

Contracts 74, policy 54, API 131 (database 29, authorization 24, credentials 17, management 19, fail-closed 9, HTTP 22, CLI end-to-end 4, OpenAPI 3, infrastructure 3, smoke 1), web 583.

Mutation checks were run on the main mechanisms (agent-scope row-level security, role check in a write policy, policy-epoch bump, transition guard, environment lock, revocation check, idempotency digest comparison, authentication hook): each was broken in turn and a test failed every time.

## Not testable yet (security properties with no test, and why)

- Grant single-use, executor exclusivity of the downstream credential, approval separation: the features do not exist.
- Behaviour under real network failure modes (TLS, partitions, failover) and under load: needs a deployed environment.
- Resistance to an attacker with arbitrary SQL as a runtime role: out of scope for row-level security (one test documents the limitation).
- Anything requiring an independent reviewer: penetration test, review of the `SECURITY DEFINER` entry points and the privilege model, key-management review.
