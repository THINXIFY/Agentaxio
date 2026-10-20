# AgentAxio — Product Requirements Document
Version 1.0 | 2026-10-20 | Status: Phase 1 baseline (proposed, pending owner approval)

## Product statement
AgentAxio is a developer-first authorization and human-approval control layer for AI agents and automated workflows. It lets organizations register agents, define permitted actions, require authorized human approval for sensitive requests, record decisions and execution outcomes, and revoke access at AgentAxio-controlled enforcement points.

**Tagline:** Control Every AI Action. This is brand positioning, not a promise of universal enforcement.

## First customers
- AI automation agencies operating n8n workflows for clients
- SaaS developers creating tool-calling AI agents with TypeScript
- Small technical teams requiring a shared approval inbox and auditable authorization policies

## Initial problem and value
Developers build custom agent permissions in multiple places; approvals and logs fragment across workflows. AgentAxio centralizes these controls for *integrated operations* with explicit agent identities and a single audit trail.

## MVP use case (golden path)
1. Organization admin creates workspace; invites an approver.
2. Admin registers Support Agent and creates a scoped credential.
3. Admin defines a `crm.lead.create` policy (mock CRM only): requests from the Lead Intake Agent require human approval; any request with fields outside the strict schema (`full_name`, `email`, `company`) is denied (example test policy; deny > require_approval > allow > implicit deny).
4. Integrated n8n workflow sends `POST /v1/action-requests` for `crm.lead.create` with the exact parameters, resource `mockcrm/leads` and an `Idempotency-Key`.
5. AgentAxio authenticates the scoped agent key, derives organization/agent/environment server-side, checks action and policy, and returns an opaque request ID with status `denied`, `pending_approval` or `queued_execution` (see N8N-ENFORCEMENT.md; no execution token is returned to n8n).
6. If approval is required, a human with the approver role reviews *the exact action parameters*.
7. A short-lived, single-use internal execution grant bound to an exact payload digest is issued only after approval (or a direct allow) and is never exposed to n8n.
8. A trusted executor verifies that grant and performs the mock action; the caller cannot bypass it with another direct credential. n8n polls `GET /v1/action-requests/:id` for status.
9. Execution status is separately reported and appended to the audit history.
10. Revoking an agent prevents subsequent actions through all integrated enforcement points.

## MVP features
**Must-have**
- Organization/workspace + RBAC (owner, admin, approver, viewer)
- Agent inventory, ownership, active/suspended states, isolated environments
- Secure credential issuance/rotation/revocation for integration clients
- Policy rules for action allow / deny / approval-required; explicit default deny
- Action-request endpoint (`POST /v1/action-requests`) with idempotency key, decision status, reason code and trace identifier
- Approval queue with expiration and separation of requester vs approver
- Execution grants with expiry, single use, payload binding and replay protection
- Append-only decision/approval/execution audit history
- One n8n integration path (controlled execution), basic TypeScript SDK, docs
- Organization membership controls, basic notifications, accessibility, responsive UI

**Should-have after private beta**
- Policy versioning UI with safe rollbacks
- More granular resource scopes and approval chains
- Organization usage analytics and billing
- Enhanced multi-region resiliency, MCP tool gateways, additional SDKs

**Out of scope MVP**
- Universal discovery/control of external AI agents
- Enterprise SSO/SCIM, arbitrary OAuth provider brokerage
- Running arbitrary customer's untrusted code in our infrastructure
- Autonomous anomaly blocking via LLMs
- Guaranteeing control over unintegrated credentials or tools
- Generic secret vault for all third-party service tokens

## User roles
- Owner: organization governance, billing, membership, policy administration
- Admin: manage agents, policies and integrations
- Approver: review scoped approval requests; cannot approve their own request by default
- Viewer: read allowed dashboard data and audit events
- Integration client: non-human scoped actor authenticated per environment; never a human admin

## Core pages
- Marketing: Home, Platform, Developers, Security, Pricing, Contact, legal
- App: onboarding, overview, agents, policy list/editor, approvals, audit, integrations/API credentials, team, settings

## Nonfunctional requirements
- Enforcement decisions independent of any generative model; no LLM required.
- Fail closed for protected operations if AgentAxio or the integration is unavailable.
- Strict workspace/organization isolation, least privilege, secrets encryption and hashed token storage.
- API rate limiting and abuse controls; no sensitive payloads in ordinary logs.
- Clear audit distinction between `authorized` and `executed`.
- WCAG 2.2 AA as UI design goal; `prefers-reduced-motion` support.
- Responsive design; dark/light/system app modes; mixed dark-light marketing pages.
- SLOs, load targets and retention durations finalized before production, not assumed.

## Acceptance criteria for private beta
- Unknown/inactive agent, invalid credential, cross-tenant agent, missing policy or altered action payload is denied in automated tests.
- Human approval cannot authorize changed parameters; expired grants cannot be reused.
- Suspended agent fails enforcement checks and cannot obtain new grants.
- Integrated action never executes without valid permit; service failure blocks it.
- Approvals cannot be self-approved without explicitly configured, tested exception (not MVP).
- Audit records show requester identity, tenant, action, policy version, decision, approver and outcome when known.
- Run at least 20 security abuse-case tests and a successful end-to-end n8n demonstration.
- Private beta does not use production financial/refund credentials until independent review. The private-beta golden path is `crm.lead.create` against a mock CRM; no refund, payment or banking action is in scope.

## Business validation
Interview 10–15 n8n agencies / AI developers; obtain 3 pilot design partners. Test whether dedicated cross-workflow approvals/policies beat native n8n features. Prioritize actual adoption and willingness to pay, not vanity traffic metrics.

## Open decisions
- Billing provider and country eligibility
- First non-financial integration action (recommended: `crm.lead.create` for safer beta)
- Hosting topology and region
- Data retention and compliance requirements
- Domain and trademark approval for AgentAxio

## Phase 1 finalized decisions (2026-10-20)
See PHASE1-DECISIONS.md and N8N-ENFORCEMENT.md. n8n trusted-executor path comes first; custom n8n node, TS SDK, billing and other third-party integrations are deferred until the end-to-end mock action is proven.
