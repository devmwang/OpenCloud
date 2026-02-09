# OpenCloud Nova (apps/nova)

TanStack Start frontend for OpenCloud.

## Key entry points

- Router bootstrap: `apps/nova/src/router.tsx`
- File routes: `apps/nova/src/routes/*`
- Global middleware: `apps/nova/src/global-middleware.ts`
- API integrations: `apps/nova/src/features/*/api.ts`
- Env handling: `apps/nova/src/env.ts`

## Common commands

Working directory: repo root.

- Dev Nova only: `pnpm run dev -- --filter=nova`
- Lint Nova only: `pnpm --filter nova lint`
- Typecheck Nova only: `pnpm run typecheck -- --filter=nova`
- Build Nova only: `pnpm run build -- --filter=nova`
- Start Nova only: `pnpm run start -- --filter=nova`

## Conventions / gotchas

- Nova communicates with the Server at `NEXT_PUBLIC_OPENCLOUD_SERVER_URL`.
- Auth uses Better Auth session cookies via `/api/auth/*`.
- CSRF token is required for protected mutations and is read from `/v1/auth/csrf`.
