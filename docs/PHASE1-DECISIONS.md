# AgentAxio Phase 1 — Approved Architecture Decisions
Version 1.1 | 2026-10-20 | Status: n8n-first architecture baseline approved for local sandbox implementation; not production security approval.

## Product boundary
AgentAxio is a managed authorization and approval enforcement service for explicitly integrated AI-agent tool actions. It does not discover every agent, own n8n's admin permissions, or prevent bypass by external tools that still hold direct service credentials. First buyer: n8n automation agencies managing client workflows.

## Delivery choices
- **First integration:** exportable n8n demo workflow using built-in HTTP Request nodes; do not begin with a custom n8n node or TS SDK.
- **Control plane:** Next.js/TypeScript management app; managed OIDC-backed human accounts; organization + membership roles owner/admin/approver/viewer.
- **Enforcement plane:** dedicated TypeScript API module; strict schemas; server-derived tenant and agent from scoped integration credentials; PostgreSQL transactional state. Modular monolith to start, no premature microservices.
- **Policy semantics:** `deny > require_approval > allow > implicit_deny`, deterministic, versioned. Missing, malformed or conflicting configuration denies. Policies specify action keys, bound environment, agent scope and validated conditions; no arbitrary JS eval or LLM policy engine.
- **Credential model:** per-organization, per-agent, per-environment service key with key ID prefix and server-side hashed verifier; reveal secret once; rotate/revoke. Do not place downstream CRM token in n8n.
- **Data path:** n8n requests a proposed action with exact parameters, AgentAxio authenticates, makes a decision, obtains human approval when required, and an AgentAxio-trusted executor (not n8n directly) carries out the allowed mock CRM action. n8n only receives result/status; it must never receive the execution grant or downstream credentials.
- **Execution grants:** private to executor; bind to tenant, agent, environment, action, resource, canonical parameter digest, policy version and expiry; atomic single-use consumption. Do not issue reusable allow flags to n8n.
- **Approvals:** authenticated approver; no self-approval; reviewer sees canonical action preview; 15-minute initial TTL (configurable later); expire/deny by default. Approval does not itself execute; executor rechecks policy, revocation, identity and expiry.
- **Idempotency:** unique request key scoped to organization and agent; identical retry returns same decision/status; changed payload with same key returns conflict. Downstream execution attempt uses unique action request ID; uncertain external results are marked `unknown` and not blindly retried.
- **Audit:** append-only application audit events for request, policy decision, approval, grant, execution start/outcome and revocation; append-only DB privileges for application path; tamper-evident export is post-MVP and must not be claimed yet.
- **Developer UX:** demo documentation, curl examples and n8n workflow JSON; SDK and billing deferred.
- **Design (updated 2026-10-20):** Obsidian Black × Midnight Violet: `#06050C` obsidian, `#101024` midnight navy, `#252044` deep indigo, `#7864F6` electric violet, `#B9ACFF` soft lavender, `#F5F4FA` arctic white; premium mixed dark/light marketing site; calm, neutral, restrained app UI with violet as an accent only. Supersedes the earlier palettes. Tokens: `apps/web/src/styles/tokens.css`.
- **Sequencing (updated 2026-10-20):** frontend (mock data, `apps/web`) is built first; backend M01–M03 follow and remain the gate for any real auth/data/integration.

## Locked demonstration
Action `crm.lead.create`, mock CRM only, allowed fields `full_name`, `email`, `company` (strict schema). An n8n AI agent proposes an action, and AgentAxio either denies, requires approval, or executes only through mock executor. No real funds, refunds, customer databases, inboxes or payment connections.

## Explicitly excluded from first milestone
Deployment, public registration, billing, SDK, arbitrary OAuth brokerage, real production tools, LLM-supplied policy logic, compliance certification, cross-platform automatic discovery. Later roadmap remains open. (UI animations were previously excluded; marketing-site motion is now allowed in the frontend track, with reduced-motion support, and must never carry security logic.)

## Assumptions / later security decisions
Hosting region and key-management provider, incident response SLAs, data retention jurisdiction and independent security testing are pending for private beta. No sensitive external production deployment until resolved.
