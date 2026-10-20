# AgentAxio — Instructions for Claude Code

You are building AgentAxio, a developer-first authorization and human-approval SaaS for AI agents. Read docs/PRD.md, ARCHITECTURE.md, SECURITY.md, DATABASE.md and ROADMAP.md (all in `docs/`) before implementing changes. Treat those as baseline requirements and flag conflicts.

## Non-negotiable engineering rules
- Frontend-first is approved (see "Development order"): interfaces may be built ahead of the backend only as clearly labelled mock/demo UI. Never build a generic dashboard that implies working controls; a dashboard section without a backend use case stays an honest "not built yet" placeholder until its use case exists.
- No UI element, copy or mock may imply real enforcement, real customers, certifications or integrations that do not exist.
- Do not claim comprehensive agent control: only tools using trusted enforcement points are protected.
- No LLM authorization decisions. Policies are deterministic and default deny.
- Never let direct workflow credentials bypass enforced actions in the supported demonstration.
- Authenticate the integration actor and derive tenant/agent from credentials; do not trust client claims.
- Bind grants to exact canonical action payload, resource, tenant, agent and policy version; single use, short TTL, atomically consumed.
- Verify authorizer role; no self-approval by default.
- Keep secrets out of source, logs and client storage; reveal newly generated credentials only once.
- All protected operations fail closed on auth/API/policy errors.
- Log both decisions and actual execution status; never conflate allowed and executed.
- Write unit/integration/security-negative tests for every permission-related change.
- Do not handle production payment/refund APIs during initial beta.

## Preferred code quality
- TypeScript strict mode; input schema validation; accessible components; modular code.
- Use migration-managed PostgreSQL schema and organization-scoped queries.
- Test migrations and concurrency/idempotency.
- Keep PR small and reviewable; describe threat impact and tests executed.
- Avoid mock data presented as real; clearly label demo states.
- Require explicit user approval before deploying, migrating production DB, enabling billing or using real credentials.

## Visual direction
- AgentAxio: **Obsidian Black × Midnight Violet** (approved 2026-10-20; supersedes Obsidian Black × Electric Lime, Black × Signal Orange and the earliest Obsidian × Electric Violet). Obsidian Black `#06050C` (sidebar, hero, darkest), Midnight Navy `#101024` (marketing dark sections), Deep Indigo `#252044` (borders, tinted pills), Electric Violet `#7864F6` (accent), Soft Lavender `#B9ACFF` (links and icons on dark), Arctic White `#F5F4FA` (light sections, dark-mode text). Violet is an accent only: primary actions, the active item, focus, chart accents. Never large glowing fields, colourful cards or gradients; never the only signal for a security state.
- Tokens live only in `apps/web/src/styles/tokens.css` (semantic roles); `config/theme-color.ts` mirrors the background for the browser `theme-color` meta. Interactive/text roles may differ from the brand hex where WCAG AA requires: violet is a *fill* with obsidian text (4.8:1; white would be 4.25:1), and violet-as-text is soft lavender on dark and deep violet `#4B38C9` on light (`primary-text`). Info is a cyan-blue so it can never read as the brand violet. The dashboard has its own calmer, neutral surfaces under `.dashboard-scope` (dark: sidebar `#06050C` < workspace `#111116` < cards `#18181E`; light: always-dark sidebar, soft off-white workspace `#F4F4F7`, cards `#FCFCFD`); the marketing site keeps the base palette. `tokens.contrast.test.ts` enforces contrast for all four palettes and `no-hardcoded-colors.test.ts` fails the build if any component hardcodes a hex colour, so a future re-brand is a one-file change.
- Marketing: high-end cinematic dark sections mixed with soft-white sections, original security-themed visuals, high-quality typography, subtle GSAP/scroll interactions with reduced-motion support.
- Dashboard: restrained enterprise UI, clear statuses, functional interactions, light/dark/system modes, fast and accessible; honor reduced-motion preference.
- Never copy the supplied design reference pixel-for-pixel; use it as inspiration only.

## Development order (approved: frontend first)
1. **Frontend track (current):** FE-00 foundation (done) -> FE-01 marketing homepage -> remaining marketing pages -> dashboard UI on mock data. Frontend work touches `apps/web` only, uses labelled mock data, and adds no auth, billing, production credentials or deployment.
2. **Backend track (next, gated):** M01 authorization core -> M02 approvals/grants/trusted executor -> M03 n8n demo. Nothing in the frontend track relaxes any backend acceptance gate.
3. **Hard gates (unchanged):** no real authentication, real data, live integration, billing or deployment until M01 passes its tests and the owner explicitly approves. SECURITY-ACCEPTANCE.md S01–S20 still apply to the backend; "advanced visual work may not substitute for negative security tests" still holds.

## First backend milestone (M01 — unchanged)
Implement a tested vertical slice: create agent -> define policy -> request authorization for safe mock action -> human approval -> single-use verified grant -> mock tool execution -> audit trail -> revoke and deny.

## Locked Phase 1 operating instructions
Consult PHASE1-DECISIONS.md, N8N-ENFORCEMENT.md, SECURITY-ACCEPTANCE.md, CLAUDE-MILESTONE-01.md. Follow n8n-first trusted executor design. Do not send an executable grant to untrusted workflow clients. N8N-ENFORCEMENT.md is the authoritative API vocabulary (`/v1/action-requests`; statuses `denied`, `pending_approval`, `approved`, `queued_execution`, `running`, `succeeded`, `failed`, `expired`, `unknown`). The private-beta golden path action is `crm.lead.create` (mock CRM only). Implement M01 before connecting any interface to real data or auth.
