# @agentaxio/api

The AgentAxio authorization API (milestone M01). **Local development only; nothing is deployed and it enforces nothing on any real system.** It decides and records; it does not execute.

- What it does and does not do, how it is built, its limits: [`docs/BE-01-BACKEND.md`](../../docs/BE-01-BACKEND.md)
- Which security criteria are proven and which are not: [`docs/M01-ACCEPTANCE.md`](../../docs/M01-ACCEPTANCE.md)
- API contract: [`openapi.json`](openapi.json)

```
corepack pnpm --filter @agentaxio/api db:setup     # once: roles, hardened database, .env (needs docker compose up -d)
corepack pnpm --filter @agentaxio/api db:migrate
corepack pnpm --filter @agentaxio/api db:seed      # invented demo data; prints the agent key once
corepack pnpm --filter @agentaxio/api dev          # http://127.0.0.1:8787
corepack pnpm --filter @agentaxio/api test         # real PostgreSQL 17, no mocks
```

Never commit `apps/api/.env` (it is git-ignored) or paste an agent key anywhere. A key cannot be shown a second time.
