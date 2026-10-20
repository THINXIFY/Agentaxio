# AgentAxio — Technical Architecture
Version 1.0 | Proposed design

## Principles
1. Authorization decisions are deterministic; AI does not decide who gets access.
2. Only trusted *enforcement points* execute controlled operations.
3. Separate control plane (dashboard + policies) from data plane (action authorization + integration gateway).
4. Use short-lived scoped identity and execution grants; reject replay and changed parameters.
5. Tenant isolation at every boundary; do not trust caller-provided tenant identifiers.
6. Prefer boring, observable infrastructure to early microservice complexity.

## Logical design
```
Human browsers -> Next.js dashboard -> authenticated application API -> PostgreSQL
                                                        |
                                                        v
                                              policy/admin management
n8n workflow / TS SDK -> integration authentication -> authorization service
                                 |                       |
                                 v                       v
                          scoped agent ID         policy engine + database
                                                         |
                                  denied / pending_approval / queued_execution
                                                         |
                            approval-required -> human inbox + approved grant
                                                         |
                                       trusted executor / enforcement gateway
                                                         |
                                            approved target tool/API
                                                         |
                                                execution audit event
```

## Stack recommendation
- Frontend: Next.js App Router, React, TypeScript, Tailwind, accessible UI primitives
- App authentication: established managed OIDC/Supabase Auth, secure server-side sessions
- Backend: TypeScript (Node.js). Start modular monolith; separate high-criticality enforcement service when needed.
- Database: PostgreSQL with migrations and tenant-aware access patterns
- Authorization: explicit policy rule evaluator for MVP; evaluate OpenFGA later for relationship complexity
- Events/queues: managed queue for notifications; approval state resides transactionally in PostgreSQL
- Audit: append-only SQL audit table with privileged write path; plan tamper-evident export for later phase
- Infrastructure: managed hosting for marketing/app, a separately scalable API worker if needed
- Observability: structured logs, metrics, traces, error tracking; redact tokens and PII

## Endpoint sketch (vocabulary standardized on N8N-ENFORCEMENT.md)
Public (integration client, scoped agent key):
- POST /v1/action-requests — propose an action; accepts `Idempotency-Key`, `action`, `resource`, exact `parameters`; agent/organization/environment are derived from the credential, never the body
- GET /v1/action-requests/:id — poll status with the same agent key

Management (authenticated human, role-checked server-side):
- POST /v1/agents — create agent (admin)
- POST /v1/agents/:id/credentials — issue scoped credential; show plaintext once
- GET /v1/approvals — human approval queue
- POST /v1/approvals/:id/approve — approval subject to revalidation and transaction
- POST /v1/approvals/:id/deny
- POST /v1/agents/:id/suspend — revoke new authorization and rotate/disable credentials

Internal only (never reachable by n8n or other untrusted workflow clients):
- Grant creation and atomic single-use consumption by the trusted executor
- Execution result reporting by the trusted executor, with strong caller authentication

## Action-request response
`{ id, status, reason_code? }` where `status` is one of `denied`, `pending_approval`, `approved`, `queued_execution`, `running`, `succeeded`, `failed`, `expired`, `unknown`. Policy effects are `deny`, `require_approval`, `allow`; absent a match the result is an implicit deny. Reason codes include `POLICY_DENY` and `HUMAN_REVIEW_REQUIRED`.
A status or decision is **not** authorization to execute a different action, and `approved` is not `succeeded`. Execution requires the trusted executor to validate an internal grant for the exact canonical payload. No grant or execution token is ever returned to n8n.

## Golden-path safeguards
- Authenticate integration, derive workspace from credential and verify registered agent binding.
- Validate action against allowlisted definitions and JSON schema; canonicalize parameter payload for digest.
- Match deny rules first, then approval rules, then explicit allow; otherwise deny.
- Serialize approval/grant state transitions atomically in SQL with unique nonce and idempotency key.
- Recheck current revocation/policy version when granting and consuming.
- Trusted executor holds downstream tool credentials; n8n workflows using direct access remain outside AgentAxio control.
- Execution callbacks cannot alter original decision history.

## Delivery slices
A. Local deterministic authorization service + tests (without UI).
B. PostgreSQL schema, auth, tenant-aware API and policies.
C. Approval pipeline, grants, revocation and audit.
D. AgentAxio dashboard (designed frontend-first on mock data; wired to real endpoints after A–C) and n8n trusted executor demo.
E. Hardening, private beta, incident/backup drills.

## Deployment caveat
Security functionality requires expert review and realistic threat tests before processing sensitive customer actions. Dashboard polish or unit test coverage are not proof of a secure service.

## Final n8n-first architecture addendum
Use PHASE1-DECISIONS.md and N8N-ENFORCEMENT.md as authoritative; the endpoint sketch and response vocabulary above have been aligned to them. Delivery slice D (dashboard) is being designed frontend-first on mock data ahead of slices A–C; wiring it to real endpoints still requires slices A–C to pass their security gates. External n8n gets an opaque action-request status, **never** a grant for direct execution. Only internal trusted executor owns downstream credentials and consumes grants.
