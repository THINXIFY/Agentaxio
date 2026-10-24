# AgentAxio

Authorization, human approval and audit for AI agent actions that run through AgentAxio-controlled enforcement points.

**Current state:** the approved frontend (`apps/web`, mock data) and the M01 backend (`apps/api`, `packages/contracts`, `packages/policy`): agent authentication, deterministic policy decisions, an audit trail, and agent/credential/policy management on a real PostgreSQL database, **local only**. It decides and records; it does not approve or execute anything yet (M02). Nothing here enforces real permissions, and the frontend is not connected to it. See [`docs/BE-01-BACKEND.md`](docs/BE-01-BACKEND.md) and [`docs/M01-ACCEPTANCE.md`](docs/M01-ACCEPTANCE.md).

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
