# AgentAxio — Database Blueprint
Version 1.0 | PostgreSQL entity outline (not final SQL migrations)

## Tables and essential columns
- `organizations`: id PK, name, slug unique, created_at
- `users`: id PK (external auth subject), email, created_at
- `memberships`: id PK, organization_id FK, user_id FK, role enum(owner/admin/approver/viewer), status, unique(org,user)
- `environments`: id PK, organization_id FK, name (dev/staging/prod), unique(org,name)
- `agents`: id PK, organization_id FK, environment_id FK, owner_user_id FK, name, description, status(active/suspended), revoked_at, created_at
- `agent_credentials`: id PK, organization_id FK, agent_id FK, credential_hash, key_prefix, scopes, created_at, expires_at, revoked_at, last_used_at
- `action_definitions`: id PK, organization_id FK, key (e.g. `crm.lead.create`), schema JSONB, downstream_connector, created_at
- `policies`: id PK, organization_id FK, environment_id FK nullable, agent_id FK nullable, action_definition_id FK, effect(allow/deny/require_approval), condition_json, priority, version, enabled, updated_by, updated_at
- `action_requests`: id PK, organization_id FK, agent_id FK, environment_id FK, action_definition_id FK, request_key, canonical_payload_digest, safe_parameters JSONB, status, created_at, expires_at; unique(organization_id,agent_id,request_key)
- `decisions`: id PK, organization_id FK, action_request_id FK, result, policy_id nullable, policy_version nullable, reason_code, decided_at
- `approval_requests`: id PK, organization_id FK, action_request_id FK, assigned_role, state(pending/approved/denied/expired), expires_at, created_at
- `approval_votes`: id PK, organization_id FK, approval_request_id FK, approver_user_id FK, decision, comment, voted_at; enforce role and no self-approval server-side
- `execution_grants`: id PK, organization_id FK, action_request_id FK, digest, nonce_hash unique, expires_at, consumed_at nullable, invalidated_at nullable
- `execution_attempts`: id PK, organization_id FK, grant_id FK, executor_id, target, state(started/succeeded/failed/unknown), external_reference nullable, started_at, finished_at
- `integrations`: id PK, organization_id FK, environment_id FK, type, display_name, status, secret_reference (never plaintext), created_at
- `audit_events`: id PK, organization_id FK, actor_type, actor_id, event_type, object_type, object_id, request_id, metadata_redacted JSONB, occurred_at
- `outbox_events`: id PK, organization_id FK, event_type, payload_redacted JSONB, published_at nullable, created_at

## Relationship and tenant rules
- Every tenant-owned record has `organization_id` and queries always scope to authenticated organization.
- Use composite foreign keys or DB constraints where possible to prevent cross-organization references (e.g. agent -> environment of same organization).
- `agent_credentials.credential_hash` stores only a strong keyed/hash representation, never the revealed original token.
- Policy changes create distinguishable versions; retain the version referenced by an authorization decision.
- Audit writes append records; updates/deletes restricted to specialized retention workflow, not application role.
- Safe parameters are minimized/redacted; exact canonical payload digest binds authorization without storing full sensitive inputs.
- Operational expiry cleanup must not erase required audit trails without an approved retention policy.

## Suggested indexes
- All FKs; `(organization_id, created_at DESC)` for audit and approvals
- `(organization_id, status)` for agents and approval requests
- `(agent_id, revoked_at)` for credential validation
- `(organization_id, agent_id, request_key)` unique for idempotency
- `(nonce_hash)` unique for grant replay prevention
- `(organization_id, action_definition_id, enabled)` for policy lookup

## Planned migration order
001 orgs/users/membership/env; 002 agents/credentials/actions; 003 policies/requests/decisions; 004 approvals/grants/executions; 005 integrations/audit/outbox/indexes; 006 tenant/RLS/hardening tests.

## DB tests
- Org A cannot fetch or mutate Org B records even with valid random IDs.
- Credential cannot authenticate an agent in a different organization.
- One-time grant consumption race has one winner.
- Idempotent duplicate action request does not create multiple executions.
- Orphaned cross-tenant foreign keys fail.

## n8n-first schema clarification
`action_requests` needs status and canonical digest and must be unique on `(organization_id,agent_id,request_key)`; policy decisions and audit entries remain distinct from `execution_attempts`. Internal `execution_grants` must never be returned to n8n.
