# AgentAxio

Authorization, human approval and audit for AI agent actions that run through AgentAxio-controlled enforcement points.

**Current state:** the approved frontend (`apps/web`, mock data) plus an empty M01 backend scaffold (`apps/api`, `packages/contracts`, `packages/policy`; slice B0 of [`docs/BE-01A-ARCHITECTURE-REVIEW.md`](docs/BE-01A-ARCHITECTURE-REVIEW.md)). No backend behaviour exists yet. Nothing here enforces real permissions.

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

The frontend needs no environment variables or secrets. The backend scaffold will need a local PostgreSQL (`docker compose up -d` with `.env` copied from `.env.example`; Docker is required from slice B2 on). Never commit `.env*` files (only `.env.example`).
