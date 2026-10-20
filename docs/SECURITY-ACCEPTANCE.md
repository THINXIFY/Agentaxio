# AgentAxio — Mandatory Security Acceptance Criteria
This is a release checklist, not a claim of certification. A milestone FAILS unless applicable tests pass.

| ID | Requirement | Negative/positive acceptance test |
|---|---|---|
| S01 | No anonymous execution | Missing/malformed/revoked agent key returns 401/403; mock CRM remains unchanged |
| S02 | Tenant isolation | Organization A agent cannot query/approve/execute organization B request; no leaked metadata |
| S03 | Environment isolation | Development agent token cannot invoke production actions |
| S04 | Default deny | Unknown action, no policy, unsupported schema or evaluator error never executes |
| S05 | Deny precedence | Explicit deny overrides allow or human approval rule |
| S06 | Payload integrity | Change one parameter/resource after approval -> invalid request or new approval required |
| S07 | No self-approval | Requester and prohibited approver identity same -> rejected server-side |
| S08 | Expiry | Approval and grant after deadline cannot execute |
| S09 | Revocation immediate at gate | Suspend agent or revoke credential after approval, before execution -> deny |
| S10 | Policy changes invalidate stale grants | Update policy version between approval and dispatch -> re-evaluate/reject |
| S11 | Replay protection | 20 parallel consume attempts on one internal grant -> <=1 winner and <=1 mock side effect |
| S12 | Idempotency | Same key/same payload -> same request; same key/different payload -> 409 |
| S13 | Outage fail closed | Simulate DB unavailable/API timeout -> zero side effects |
| S14 | Audit fidelity | Separate authorization, reviewer vote and execution result records, correlated by request ID |
| S15 | Secret hygiene | Secrets never shown in logs or browser after initial generation; hashed at rest |
| S16 | Role permissions | Viewer cannot edit policy or approve; approver cannot grant own admin access |
| S17 | Input hardening | Unknown keys, oversized bodies, invalid email, noncanonical resource and injection-like strings safely rejected/treated as data |
| S18 | Mock execution uniqueness | Executor alone possesses mock CRM write authority; n8n cannot invoke mock write endpoint |
| S19 | Status access | Cross-tenant request ID probe returns indistinguishable denial without revealing existence |
| S20 | Quality gate | strict TypeScript, lint, integration suite and migration tests green in CI |

## Release gates
**Local slice:** S01–S05, S12, S13, S17, S20 plus policy tests. **End-to-end n8n demo:** all S01–S20. **External private beta:** secrets review, dependency scan, secure TLS, rate limits, backups, restore test, monitoring, vulnerability review, data retention, incident plan. **Sensitive production:** independent expert security assessment and fixes; never substitute AI-generated test reports for this.

## Operational design notes
Audit DB is append-only to app role, not inherently tamper-proof from DB superusers. Error statuses must be generic to external callers but traceable internally via correlation ID. Review screen should display canonical parameters in readable form and sanitize text for HTML.
