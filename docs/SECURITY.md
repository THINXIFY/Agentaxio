# AgentAxio — Security Baseline and Threat Model
Version 1.0 | Draft for review — not a certification

## Security claims we can make for the MVP
For supported integrations configured to route execution through an AgentAxio-controlled enforcement point, the service checks agent identity and policies and may require human approval before execution. It logs authorization decisions and reported execution outcomes.

## Security claims we must NOT make
- We control all AI agents automatically.
- An agent cannot bypass controls if it has direct downstream credentials.
- Every approved action has definitely executed.
- The product is enterprise compliant/penetration-tested without evidence.
- AI-generated code or Claude Code output is security assurance.

## Protected assets
Workspace membership and roles; agent credentials; downstream integration secrets; authorization policies; approval decisions; grants/nonces; audit records; customer action parameters; tenant data.

## Trust boundaries
1. Web browser <-> management API
2. Workflow/SDK <-> agent authentication + action-request API
3. Action-request API <-> PostgreSQL/policy evaluator
4. Authorized human <-> approval endpoints
5. Grant validator <-> trusted gateway/executor <-> downstream service
6. Internal services <-> event/logging systems

## Key threats and required mitigations
| Threat | Mitigation | Test |
|---|---|---|
| Agent impersonation or stolen token | Hash stored secrets; scoped credentials; rotation; rate limits; short-lived grants | revoked/invalid credential denied |
| Cross-tenant access/IDOR | Server-derived tenant, per-query tenant enforcement, membership checks, optional RLS defense | cross-tenant fuzz tests |
| Confused deputy/tool substitution | Bind grant to tenant, agent, action, target and canonical parameters digest | modified amount/recipient denied |
| Replay of approval/grant | Nonces, atomic single-use consume, TTL, idempotency | same grant second use denied |
| Policy bypass | Default deny, deny precedence, enforcement gateway holds downstream credentials | direct disallowed API path documented/blocked |
| Self-approval/collusion | Segregated approver roles, independent human auth, no self-approval in MVP | self-approval denied |
| Stale approval after revocation | Revalidate agent state, credential and policy version at execution | revoked after approval denied |
| Outage/failure open | Deny protected actions on timeout/errors; bounded retries, no implicit approval | API down -> target not executed |
| Audit tampering | Append-only permissions, restricted writer, offsite export / tamper-evident strategy | unauthorized changes rejected |
| Secrets disclosure | KMS at rest, TLS in transit, environment secret management, redaction | no tokens in logs/UI |
| Approval phishing/CSRF | CSRF protection where needed, strong session controls, exact action summary, audit | forged approval rejected |
| Supply-chain vulnerability | dependency pinning, lockfile, dependency scanning, code review | critical dependency checks |
| Prompt injection in agent inputs | Treat agent text as untrusted; deterministic validation of action schema/policies | prompt cannot change policy |

## Engineering controls
- Enforce server-side authorization on every mutation; role labels in UI confer no rights.
- Prefer established auth/session solutions. Cookies HttpOnly, Secure, SameSite; no long-lived secrets in localStorage.
- Require TLS; secure CORS; strict input validation; upload restrictions if any.
- Separate test/demo credentials from real ones and production environments.
- Apply rate limits to credentials, approvals, policy changes and decision endpoints.
- Establish backup, restoration tests, migrations, access reviews and incident response contacts before public launch.
- Do not accept payment/refund/bank-transfer use cases in initial unsecured beta.

## Security gates
**Gate 1: local prototype** — unit tests for policies, tenant isolation, expiration, replay, fail closed.
**Gate 2: external private beta** — integration tests, authentication review, dependency checks, secret scanning, alerting, backups, operational monitoring.
**Gate 3: sensitive production** — independent architecture and penetration assessment, remediation, recovery exercises, written threat model update, legal/privacy review.

## Decisions to finalize
Encryption and key-management provider; audit retention/erasure and legal basis; regions/data residency; incident SLA; accessibility and regulatory requirements for target markets.

## Phase 1 acceptance baseline
The 20 mandatory testable criteria and release gates are in SECURITY-ACCEPTANCE.md. Phase 1 architecture is finalized for local implementation, not certified or approved for sensitive production use.
