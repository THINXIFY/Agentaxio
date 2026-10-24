# AgentAxio

Authorization, human approval and audit for AI agent actions that run through AgentAxio-controlled enforcement points.

**Current state:** the approved frontend (`apps/web`) and the backend (`apps/api`, `apps/mock-crm`, `packages/contracts`, `packages/policy`): agent authentication, deterministic policy decisions, human sign-in (OpenID Connect), human approvals, single-use grants, a trusted executor that calls a **mock** CRM, an audit trail, and a live dashboard, on a real PostgreSQL database, **local only**. Without `AXO_API_URL` the dashboard shows labelled sample data; with it, it reads and changes real local records. Nothing is deployed, no real identity provider is connected, and nothing has had an independent security review. See [`docs/BE-02-BACKEND.md`](docs/BE-02-BACKEND.md), [`docs/M02-ACCEPTANCE.md`](docs/M02-ACCEPTANCE.md) and (earlier) [`docs/BE-01-BACKEND.md`](docs/BE-01-BACKEND.md).

- Product and architecture: [`docs/`](docs) and [`CLAUDE.md`](CLAUDE.md)
- Frontend foundation, structure, rules and open conflicts: [`docs/FRONTEND-FOUNDATION.md`](docs/FRONTEND-FOUNDATION.md)

## Run

Requires Node 22+ and pnpm (`corepack enable` or `corepack pnpm …`).

```
pnpm install
pnpm dev        # http://localhost:3000  (/, /dashboard, /design-system)
pnpm check      # prettier + eslint + tsc + vitest
pnpm build
```

The frontend needs no environment variables or secrets. The backend needs a local PostgreSQL 17 (`docker compose up -d` after copying `.env.example` to `.env`); its setup, migration, seed and run commands are in [`apps/api/README.md`](apps/api/README.md). The backend tests start their own PostgreSQL 17 when Docker is absent. Never commit `.env*` files (only `.env.example`).
