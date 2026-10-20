# AgentAxio

Authorization, human approval and audit for AI agent actions that run through AgentAxio-controlled enforcement points.

**Current state:** frontend foundation only (`apps/web`, mock data). The backend (`apps/api`, `packages/*`) has not been started. Nothing here enforces real permissions.

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

No environment variables or secrets are required. Never commit `.env*` files (only `.env.example`).
