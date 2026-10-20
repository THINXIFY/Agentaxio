# First Claude Code Implementation Milestone — Authorization Core
Milestone `M01` | Local only | Goal: tested policy decisions and isolation. Sequencing note (owner decision 2026-10-20): frontend FE-00/FE-01 on mock data proceeds first; M01 remains the mandatory gate before any real auth, data, integration or deployment, and none of its acceptance criteria are relaxed. `apps/web` currently exists; `apps/api` and `packages/*` are created by M01.

## Work to create
- Setup monorepo (e.g. pnpm `apps/web`, `apps/api`, `packages/policy`, `packages/contracts`), strict TypeScript, ESLint, formatter, Vitest, local PostgreSQL via Docker Compose, env example.
- Define validated schemas for `crm.lead.create`, agent identity, normalized resource, decision outcomes, and typed reason codes.
- Implement pure, deterministic `evaluatePolicy({principal, action, resource, parameters, policies, now})` returning deny / require_approval / allow with `deny > require_approval > allow > implicit_deny` (the HTTP layer maps these to `denied` / `pending_approval` / `queued_execution`); no network call or LLM.
- Create first migration for organizations, memberships, environments, agents, agent credentials (hashes), actions, policies, requests, decisions and audit events with organization-specific uniqueness.
- Build locally runnable minimal API for scoped agent key auth and `POST /v1/action-requests`; test org-derived identity and idempotency; no downstream side effect in M01.
- Use seed data only for invented test organizations and mock agent; create no real client data.
- Add CI and ≥20 focused unit/integration tests, including cross-org, expired/revoked keys, unknown actions, deny precedence, malformed payload, stable retries and changed-payload conflict.
- Produce OpenAPI sketch, test output and short threat/architecture review note listing M02 blockers.

## Definition of done
Commands for fresh clone, install, DB migrate, seed, test and locally exercising the API are documented and reproducible. All required tests pass. No keys in repository. No browser demo implies real security. No deployment or production data. M02 will add approvals, grant lifecycle and trusted mock executor; M03 n8n demo and wiring the (already designed) dashboard to real endpoints.

## Copy/paste first prompt
> You are the senior backend/security engineer for AgentAxio. Read PRD.md, ARCHITECTURE.md, DATABASE.md, SECURITY.md, ROADMAP.md, CLAUDE.md, PHASE1-DECISIONS.md, N8N-ENFORCEMENT.md, SECURITY-ACCEPTANCE.md and CLAUDE-MILESTONE-01.md before doing any work. Implement ONLY M01 as specified. First summarize assumptions and plan; then create local-only monorepo, pure deterministic default-deny policy engine, tenant-scoped authentication and schema, idempotent request endpoint, migration tests and negative security tests. Ensure no real downstream executions, billing or cloud deployment. Run checks and show passing/failing tests, changed files and unresolved threats. Do not claim enterprise security. Request explicit approval before connecting a live service or applying production migrations.
