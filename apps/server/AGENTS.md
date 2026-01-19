# OpenCloud Server (apps/server)

Fastify 5 API server (TypeScript, ESM) with Drizzle (Postgres), JWT cookie auth, and a disk-backed file store.

## Key entry points
- Server bootstrap + route/schema registration: `apps/server/src/index.ts`
- Systems (routes + schemas): `apps/server/src/systems/*`
  - `auth`: `apps/server/src/systems/auth/*`
  - `upload`: `apps/server/src/systems/upload/*`
  - `fs`: `apps/server/src/systems/fs/*`
  - `folder`: `apps/server/src/systems/folder/*`
- Env schema/loading: `apps/server/src/env/env.ts`
- DB plugin: `apps/server/src/utils/db.ts` (attaches `server.db`)
- Drizzle config: `apps/server/drizzle.config.ts`
- Drizzle schema: `apps/server/src/db/schema/*`

## Common commands
Working directory: repo root.

- Dev server only (dotenvx + turbo): `pnpm run dev -- --filter=server`
- Typecheck server only: `pnpm run typecheck -- --filter=server`
- Build server only: `pnpm run build -- --filter=server`
- Start server only (builds first via turbo): `pnpm run start -- --filter=server`

## Database (Drizzle)
Working directory: repo root (wrap with dotenvx so `DATABASE_URL` is loaded).

- Generate migrations: `dotenvx run --convention=nextjs -- pnpm --filter server db:generate`
- Apply migrations: `dotenvx run --convention=nextjs -- pnpm --filter server db:migrate`
- Push schema (dev): `dotenvx run --convention=nextjs -- pnpm --filter server db:push`
- Open Drizzle Studio: `dotenvx run --convention=nextjs -- pnpm --filter server db:studio`

## Conventions / gotchas
- Add new Zod schemas to the schema list in `apps/server/src/index.ts` so `server.addSchema(...)` registers them.
- REST API routes are mounted under `/v1/*` (see prefixes in `apps/server/src/index.ts`).
- File storage:
  - Root directory is `FILE_STORE_PATH` (from `.env*`).
  - Files are served statically under `/FileStore/` (Fastify static in `apps/server/src/index.ts`).

## Shared docs
- Workspace command patterns: [docs/agents/WORKSPACE_COMMANDS.md](../../docs/agents/WORKSPACE_COMMANDS.md)
- Env vars: [docs/agents/ENVIRONMENT.md](../../docs/agents/ENVIRONMENT.md)
- Runtime overview: [docs/agents/ARCHITECTURE.md](../../docs/agents/ARCHITECTURE.md)
- Lint/typecheck/format: [docs/agents/LINTING_AND_FORMATTING.md](../../docs/agents/LINTING_AND_FORMATTING.md)
