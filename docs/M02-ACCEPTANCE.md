# M02 acceptance — what is proven, what is not

Scope of M02 (BE-02): human authentication, human approvals, single-use grants, a trusted executor against a **mock** CRM, security hardening, and a dashboard connected to the real API — all **local**. Criteria are those of `docs/SECURITY-ACCEPTANCE.md`; "satisfied" means *covered by tests that fail when the control is broken and that pass on the machine this was built on*. It is **not** a security approval and **not** production readiness.

All integration tests run against a real PostgreSQL 17 server (nothing in the database layer is mocked). The sign-in tests run against a **protocol test double** of an OpenID Connect provider, not a real one.

**Verdict.** On the local machine, every M02 criterion below is either satisfied or explicitly listed as partial/unverified. Three things stop this from being called closed: (1) the GitHub Actions workflow has not run on this branch (nothing is pushed), (2) no real identity provider has been connected, so interoperability is unverified, and (3) there has been no independent security review. The business decisions the owner must make are in `docs/BE-02-DECISIONS.md` ("Unresolved business decisions").

## Criteria

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| S02 | A general permission never bypasses a required approval | **Satisfied** | `executor.test` "S02 …": an `allow` beside a `require_approval` stays pending; a forged `queued_execution` row without an approved approval is blocked (`APPROVAL_DENIED`); a request queued as allowed whose policy now requires approval is blocked (`POLICY_CHANGED`). Mutation: executor ignoring the approval row → caught |
| S06 | Payload integrity after approval | **Satisfied** | `approvals.test` "S06 …": a decision on a different fingerprint is refused and audited; changed parameters are a different request needing its own approval; `executor.test` swapped/erased/tampered ciphertext is blocked (`DIGEST_MISMATCH`), the untouched request still runs |
| S07 | No self-approval | **Satisfied** | `approvals.test` "S07 …": agent owner, registrar and key issuer all refused for approve and reject, audited; an unrelated approver succeeds. Enforced in the database function. Over HTTP: 403 `SELF_APPROVAL` |
| S08 | Expiry of approval and grant | **Satisfied** | `approvals.test` "S08 …": reads as expired without a background job, cannot be approved after the deadline, maintenance records it; `executor.test` expired grant blocked and the request marked expired |
| S09 | Revocation immediate | **Satisfied** | `executor.test` suspend/revoke withdraw queued work; halted environment blocks at claim; defence in depth when the withdrawal is bypassed (agent, credential, environment); `approvals.test` approval vs suspension race never leaves anything runnable |
| S10 | Policy change invalidates stale grants | **Satisfied** | `executor.test` "S11 …": policy changed to deny after approval is blocked, the grant is invalidated with its reason, no call reaches the destination |
| S11 | Replay on a grant / single use | **Satisfied** | `executor.test` "S10 …": 10 racing executors → exactly one runs; many grants across two tenants run once each with their own values; consumed grant cannot be reset (trigger) or claimed again |
| S12 | Idempotency / duplicates | **Satisfied** | M01 tests plus `executor.test` replayed submission executes once; the destination also de-duplicates on the request id (`mock-crm` tests) |
| S13 | Failure fails closed; audit consistency | **Satisfied** | `executor.test` "S13 …": if the claim cannot be audited, the destination is never called and the grant stays usable; if the result cannot be audited, the attempt stays open and is closed as `unknown`, never re-run |
| S14 | Audit fidelity (authorized ≠ executed) | **Satisfied** | Separate, ordered events: request, decision, approval, queued, grant claimed, execution started, execution succeeded/failed/unknown (`executor.test` golden path asserts the exact sequence); no submitted values in any event |
| S15 | Secret hygiene | **Satisfied for what exists** | Agent keys, session tokens, CSRF tokens, invitation codes are stored hashed only; new keys and invitation codes are shown once and never written to browser storage (`live.test`); parameters encrypted at rest; `auth.test` logs contain no cookie/token; secrets only from the environment. Key management service not chosen (see gaps) |
| S16 | Role permissions | **Satisfied** | `approvals.test` "S16 …" (viewer and non-member refused in the database; fresh MFA required; cross-tenant approver cannot decide, review or see); `people.test` role rules (nobody changes their own role, admins limited, last owner kept); `privileges.test` privilege matrix per runtime role |
| S17 | Input hardening | **Satisfied** | Strict schemas on every management route; decision route rejects unknown fields, bad digests and bad decisions (422) |
| S18 | Mock execution uniqueness / destination protected | **Satisfied (mock only)** | `executor.test` "S18 …": the mock CRM refuses an agent key, no token, a wrong token; the executor role has no table access; idempotency key = request id |
| S19 | Status access | **Satisfied** | M01 tests unchanged; foreign ids still 404 |
| S20 | Quality gate | **Satisfied locally** | Prettier, ESLint (strict), TypeScript strict, all tests, both production builds (demo and live mode). CI **not yet observed running** |

## Authentication and sessions (not numbered in SECURITY-ACCEPTANCE)

Covered by `auth.test` (43) and `people.test` (25): single-use state/nonce bound to the browser; PKCE; wrong audience/issuer/nonce, expired, bad signature, algorithm confusion, `alg: none`, missing subject all rejected; a replayed authorization code is rejected; session fixation (new session each login, old revoked); idle and absolute expiry; logout revokes server-side; disabled accounts cannot sign in; CSRF and Origin enforced before body parsing; MFA from `amr` categories; step-up requires re-authentication at the provider and a fresh `auth_time`; open-redirect guard on `return_to`; invitations single-use, email-bound, expiring; role rules enforced in the database.

## Mutation checks

Each mechanism below was broken in turn (source edited, the relevant suite run, the source restored). A test failed every time unless noted.

Caught by a test (21 of 24):

- approvals: self-approval check removed; credential issuer no longer counted as related; reviewed-digest check removed; fresh-MFA requirement removed; role check removed; expiry not enforced at decision time
- executor claim: ignores the approval row; ignores the digest verification result; ignores a suspended agent; ignores a revoked key; ignores a halted environment; ignores an expired grant; ignores the re-evaluated policy result; does not consume the grant; result recordable by any executor or twice; crashed attempts never closed as unknown; retention purge disabled
- management/sign-in: CSRF token not verified; Origin not checked; login transaction replayable
- rate limiting: agent request limit not enforced

Survived — and why (3 of 24, all redundancy, none a gap in behaviour):

- *Policy-epoch comparison in the executor claim.* It compares the epoch read under the lock with itself, so it is a consistency assertion that cannot differ while the environment lock is held. The control that actually stops a request after a rule change is the **re-evaluation of the current rules** (mutated separately and caught). A unit test now documents the consequence: an unrelated rule change does not stop a request, a relevant one does. A stricter "any rule change stops everything waiting" behaviour would be possible; it was not chosen because the re-evaluation is exact.
- *ID-token nonce check and audience check in our code.* The OpenID library performs the same two checks first, so removing ours changes nothing. Our own code exists for the signature check, which the library does not perform on the back channel; removing that was caught in the sign-in tests.

An earlier version of this run reported CSRF, Origin and login-replay mutations as surviving: that was the wrong test file being run, and a real missing test for login-transaction replay at the database (since added).

## Tests at the time of writing

Contracts 74, policy 54, mock CRM 7, web 610 (of which 16 test the live components and 11 the API helpers), API 287 (auth 44, people 25, approvals 31, executor 29, rate limiting 13, and the M01 suites: database, authorization, credentials, management, fail-closed, HTTP, CLI, OpenAPI, privileges, config, smoke). A manual end-to-end script (`apps/api/test/support/live-flow.mjs`) drove the real stack (browser-like client → website proxy → management API → database → agent API → executor → mock CRM) and passed 32/32 checks, including self-approval, wrong-fingerprint, viewer and CSRF/Origin refusals.

## Not satisfied / not verified (read this)

- **Unverified:** behaviour against a real identity provider; GitHub Actions on this branch; the dashboard in a real browser (visual layout, dark/light, keyboard flow were not inspected by eye — component tests with an accessibility checker pass, and the HTML served by the running website was checked); behaviour behind a reverse proxy (trusted-proxy setting); load and soak; Windows-only quirks were not tested on Linux locally (CI will).
- **Not built:** screens for role changes, removing members, organization switching, integrations, billing, settings; a management-API OpenAPI document; outbound email; resume actions are not step-up gated; separation between policy editors and approvers (D6).
- **Not decided (owner):** identity provider vendor and tenant; key-management service and hosting region; legal retention periods; email provider.
- **Not claimed:** that any real system is protected. Only calls made through the AgentAxio API are controlled, and the only destination is the mock CRM. n8n is not connected (M03).
