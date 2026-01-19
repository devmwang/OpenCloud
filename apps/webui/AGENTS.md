# OpenCloud WebUI (apps/webui)

Next.js 16 App Router UI (React 19, Tailwind CSS v4).

## Key entry points
- Route groups (App Router): `apps/webui/src/app/*`
  - Unauthenticated: `apps/webui/src/app/(unauthenticated)`
  - Authenticated: `apps/webui/src/app/(authenticated)`
  - Shared file routes: `apps/webui/src/app/(dual)`
- Next config (typed routes + image remote patterns): `apps/webui/next.config.mjs`
- Tailwind PostCSS setup: `apps/webui/postcss.config.cjs`
- Env schema/loading: `apps/webui/src/env/env.mjs`

## Common commands
Working directory: repo root.

- Dev WebUI only (dotenvx + turbo): `pnpm run dev -- --filter=webui`
- Lint WebUI: `pnpm --filter webui lint`
- Typecheck WebUI only: `pnpm run typecheck -- --filter=webui`
- Build WebUI only: `pnpm run build -- --filter=webui`
- Start WebUI only (builds first via turbo): `pnpm run start -- --filter=webui`

## Conventions / gotchas
- WebUI talks to the Server via `/v1/*` on `NEXT_PUBLIC_OPENCLOUD_SERVER_URL` (see `.env.example`).
- App Router uses server components; requests that need auth typically forward cookies (example: `apps/webui/src/app/(dual)/file/[fileId]/page.tsx`).

## Shared docs
- Workspace command patterns: [docs/agents/WORKSPACE_COMMANDS.md](../../docs/agents/WORKSPACE_COMMANDS.md)
- Env vars: [docs/agents/ENVIRONMENT.md](../../docs/agents/ENVIRONMENT.md)
- Runtime overview: [docs/agents/ARCHITECTURE.md](../../docs/agents/ARCHITECTURE.md)
- Lint/typecheck/format: [docs/agents/LINTING_AND_FORMATTING.md](../../docs/agents/LINTING_AND_FORMATTING.md)
