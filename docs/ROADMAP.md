# AgentAxio — Delivery Roadmap
Version 1.0 | Phases are sequential with security gates; design runs in parallel with engineering

1. **Foundation (now):** PRD, architecture, data model, threat model, test plan, owner decisions. Exit: reviewed requirements and defined golden-path demo.
2. **Visual brand and UI system (done: FE-00, identity refined in FE-03):** Obsidian Black × Midnight Violet (supersedes Electric Lime, Black × Signal Orange and the earliest Obsidian × Electric Violet); violet used sparingly as an accent; semantic status colours kept separate from the accent; dashboard light/dark/system; accessible tokenised components. Exit: tokens and responsive UI prototypes.
3. **Marketing (in progress, frontend-first):** Search-friendly, responsive marketing website; dark/soft-white section mix; original artwork, purposeful GSAP motion, reduced-motion behavior. FE-01 homepage first, then remaining pages (done in FE-08: Platform, Features, Solutions, Security, Developers, Pricing, About, Contact, and draft Privacy and Terms; open launch items in docs/FE-08-LAUNCH-BLOCKERS.md). Exit: all links functional, accessible, no unsubstantiated security claims, no fabricated customers or integrations.
4. **Accounts:** Secure auth, organizations, invitations, membership and roles. Exit: tenant isolation + auth integration tests.
5. **Agent registry:** Create/list/suspend agents, environments, credential issuance and management. Exit: suspension actually denies authorization.
6. **Authorization:** Policy evaluator, action schemas, decision endpoint, replay-safe grants. Exit: deny-by-default and payload-change test suite.
7. **Approvals & audit:** Queue, authorization, expiry, grant consumption, execution records. Exit: no approval bypass / self-approval.
8. **Developer integration:** n8n trusted gateway demo, TS SDK, docs, sample. Exit: guarded `crm.lead.create` success + fail-closed cases.
9. **Commercial:** Billing, usage metering, notifications, admin operations, subject to beta feedback. Exit: end-to-end plan enforcement, no impact on security policy authorization.
10. **Hardening and private beta:** Threat review, load tests, backup restore, security review, telemetry, UX polish and pilot users. Exit: documented private-beta readiness sign-off.

## Approved development order (frontend first)
Owner decision 2026-10-20: the frontend is built and reviewed first, on clearly labelled mock data, in `apps/web` only.
- **Frontend track:** FE-00 foundation (done) -> FE-01 marketing homepage -> remaining marketing pages -> dashboard UI on mock data.
- **Backend track (gated):** M01 (done, merged) -> M02 (built locally on branch `be-02-approvals-execution`, awaiting owner review; see `docs/M02-ACCEPTANCE.md`) -> M03, below. Phases 4–10 above keep their security exit criteria unchanged.
- The frontend track does **not** relax any gate: no real authentication, real data, live integration, billing, production credentials or deployment until M01 passes and the owner approves. The UI never implies enforcement it does not have.

## Recommended immediate work for the backend track (when started)
- Session 1: review Phase 1 decisions, set up monorepo, lint/test tooling, DB migrations.
- Session 2: implement policy rule types and deterministic evaluate() with denial tests.
- Session 3: implement tenant-aware agent auth and credential lifecycle.
- Session 4: implement action requests and audit pipeline.
- Session 5: implement approval/grant consumption and protected mock executor.

## Launch restriction
Until security review, use sandbox or mock downstream APIs; do not claim universal agent control or support sensitive financial operations.

## First backend delivery milestone
Implement CLAUDE-MILESTONE-01.md locally, followed by M02 approvals/grants/trusted mock executor, then M03 real n8n workflow. Frontend work proceeds first by owner decision, but no advanced visual work may substitute for negative security tests or satisfy a security acceptance gate.
