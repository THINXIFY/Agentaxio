# @agentaxio/api

The AgentAxio authorization backend (milestones M01 and M02): the agent API, the management API for signed-in people, and the trusted executor. **Local development only; nothing is deployed and it controls nothing on any real system.** The executor can only create a lead in the bundled **mock** CRM.

- What it does and does not do, how it is built, its limits: [`docs/BE-01-BACKEND.md`](../../docs/BE-01-BACKEND.md)
- Which security criteria are proven and which are not: [`docs/M01-ACCEPTANCE.md`](../../docs/M01-ACCEPTANCE.md)
- Approvals, executor, sign-in and the live dashboard: [`docs/BE-02-BACKEND.md`](../../docs/BE-02-BACKEND.md); decisions: [`docs/BE-02-DECISIONS.md`](../../docs/BE-02-DECISIONS.md); proof status: [`docs/M02-ACCEPTANCE.md`](../../docs/M02-ACCEPTANCE.md)
- Agent API contract: [`openapi.json`](openapi.json)

```
corepack pnpm --filter @agentaxio/api db:setup     # once: roles, hardened database, .env (needs docker compose up -d)
corepack pnpm --filter @agentaxio/api db:migrate
corepack pnpm --filter @agentaxio/api db:seed      # invented demo data; prints the agent key once
corepack pnpm --filter @agentaxio/api dev          # agent API, http://127.0.0.1:8787
corepack pnpm --filter @agentaxio/api dev:management   # management API (needs the AXO_OIDC_* settings), :8788
corepack pnpm --filter @agentaxio/api dev:executor     # trusted executor (needs AXO_MOCK_CRM_*)
corepack pnpm --filter @agentaxio/mock-crm start       # the mock CRM, :8790
corepack pnpm --filter @agentaxio/api dev:stack        # ALL of the above in one throw-away demo, with a stand-in sign-in page
corepack pnpm --filter @agentaxio/api test         # real PostgreSQL 17, no mocks
```

Never commit `apps/api/.env` (it is git-ignored) or paste an agent key anywhere. A key cannot be shown a second time.
