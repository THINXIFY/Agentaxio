# AgentAxio — n8n Integration Contract (V1)

## Why not rely only on n8n built-in HITL?
n8n already has human review for tool calls. AgentAxio adds organization-scoped reusable policies, agent identities, revocation, centralized approvals and cross-workflow audit. n8n's native HITL can be used separately, but it does not count as AgentAxio enforcement.

## Trusted sequence
1. Provision an organization, environment, agent and scoped credential in AgentAxio; only store the AgentAxio credential in the n8n credential store.
2. An n8n agent proposes `crm.lead.create` as typed JSON parameters. Treat these values as untrusted; no external CRM credentials are present in n8n.
3. n8n HTTP Request calls `POST /v1/action-requests` with `Idempotency-Key` and the proposed action. Authenticate scoped key; derive agent/org/environment server-side, never from caller body.
4. AgentAxio validates JSON schema and canonicalizes allowed keys; computes digest and evaluates policy transactionally. Returns `denied`, `pending_approval`, or `queued_execution` plus opaque request ID. No execution token is returned.
5. For `pending_approval`, authenticated human reviews exact action values and approves or rejects. Action parameters cannot be edited in place; edits require a new request and new approval.
6. For an approved or directly allowed request, trusted executor revalidates active credential, agent and current policy version, atomically consumes internal grant, performs mock operation, and logs outcome.
7. n8n polls `GET /v1/action-requests/:id` with same agent key (or uses authenticated completion callback in a later iteration); statuses include `denied`, `pending_approval`, `approved`, `queued_execution`, `running`, `succeeded`, `failed`, `expired`, `unknown`.

## First n8n workflow
Trigger (manual or chat) -> structured action parameters -> HTTP Request to create action -> polling Wait/HTTP Request loop with upper bounded attempts -> IF succeeded -> send confirmation; otherwise show pending/denied/failed status. Do NOT connect a direct CRM Create Lead node after a client-side `allow` response. The mock target exists only behind AgentAxio executor.

## Protocol sketch
`POST /v1/action-requests` body:
```json
{"action":"crm.lead.create","resource":"mockcrm/leads","parameters":{"full_name":"Ada Example","email":"ada@example.test","company":"Sample Co"}}
```
Headers: `Authorization: Bearer <scoped-agent-key>`, `Idempotency-Key: <random unique request key>`. Agent/workspace identity is not accepted from the body.
Response examples: `202 {"id":"opaque-id","status":"pending_approval","reason_code":"HUMAN_REVIEW_REQUIRED"}`; `202 {"id":"opaque-id","status":"queued_execution"}`; `403 {"id":"opaque-id","status":"denied","reason_code":"POLICY_DENY"}`. Exact API details must be documented in generated OpenAPI spec and tested.

## Enforcement limitations
- Administrators who retain independent access to downstream credentials can bypass AgentAxio; do not claim otherwise.
- If authorization API or database cannot be reached, protected actions MUST NOT execute; workflow fails closed.
- HTTP Request n8n retries are safe only with stable idempotency key; never auto-repeat uncertain external side effects.
- Never log raw Authorization headers, integration secrets, sensitive lead content or unsanitized model instructions.

Reference: https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools
