# OpenCloud Agent Guide

## Repository layout
- `apps/server`: Fastify API server (TypeScript, Prisma, JWT auth).
- `apps/webui`: Next.js 16 App Router UI (React 19, Tailwind CSS).
- `common/tsconfig`: Shared TypeScript base configs.
- `common/eslint-config-custom`: Shared ESLint flat config composition.
- `turbo.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`: Turborepo + pnpm workspace setup.

## Runtime architecture
- WebUI talks to the Server over the REST API (`/v1/*`).
- Auth uses JWT cookies: `AccessToken` (~15m) and `RefreshToken` (~7d) with rotation.
- Files are stored on disk (`FILE_STORE_PATH`) and served with Fastify static plus API routes.

## Server overview (`apps/server`)
- Entry: `apps/server/src/index.ts` registers plugins, schemas, and routes.
- Systems:
  - `auth`: login/session/refresh/access rules/upload tokens.
  - `upload`: file upload endpoint.
  - `fs`: file list/get/delete.
  - `folder`: folder list/create/delete.
- Schema flow:
  - Zod schemas live in `*.schemas.ts`.
  - `apps/server/src/utils/zod-schema.ts` converts Zod -> JSON Schema.
  - Schemas are registered in `apps/server/src/index.ts`.
- Prisma:
  - Schema: `apps/server/prisma/schema.prisma` (PostgreSQL).
  - Plugin: `apps/server/src/utils/prisma.ts` attaches `server.prisma`.

## WebUI overview (`apps/webui`)
- App Router with route groups:
  - `src/app/(unauthenticated)` for login/landing.
  - `src/app/(authenticated)` for main UI.
  - `src/app/(dual)` for shared file routes.
- Proxy: `apps/webui/src/proxy.ts` handles auth gating and token refresh.
- Next config: `apps/webui/next.config.mjs` uses `typedRoutes` and image `remotePatterns`.
- Tailwind 4: PostCSS uses `@tailwindcss/postcss` in `apps/webui/postcss.config.cjs`.

## Environment variables
Server (`.env.local` / `.env`):
- `OPENCLOUD_WEBUI_URL`: WebUI origin used for CORS.
- `COOKIE_URL`: Cookie domain.
- `AUTH_SECRET`: JWT signing secret.
- `DATABASE_URL`: Postgres connection string.
- `FILE_STORE_PATH`: Directory for stored files.

Client (`.env.local`):
- `NEXT_PUBLIC_OPENCLOUD_SERVER_URL`: Base URL for the API server.

## Tooling and versions
- Node.js: `>=22.12.0` (Prisma 7 supports 20.19+, 22.12+, 24+).
- pnpm: `10.28.0` (workspace manager).
- Next.js 16, React 19, Tailwind 4.
- Fastify 5, Prisma 6, TypeScript 5.9.
- ESLint 9 with flat config (`eslint.config.js`).
- dotenvx for env loading (CLI + server bootstrap).
- Server dev uses `tsx`; production builds use `tsdown`.

## Common commands
- Install: `pnpm install`
- Dev (all apps): `pnpm run dev`
- Build (all apps): `pnpm run build`
- Lint (workspace): `pnpm run lint`
- Typecheck (workspace): `pnpm run typecheck`
- Server-only:
  - `pnpm --filter server db:generate`
  - `pnpm --filter server db:migrate`
  - `pnpm --filter server dev`
  - `pnpm --filter server typecheck`
- WebUI-only:
  - `pnpm --filter webui dev`
  - `pnpm --filter webui build`
  - `pnpm --filter webui typecheck`

## Linting
- Root config: `eslint.config.js` (flat config).
- Shared rules: `common/eslint-config-custom`.
- WebUI uses `eslint .` because Next 16 removed `next lint`.
- Server-specific type-aware rules are scoped to `apps/server/**/*.ts`.
- After any code change, run `pnpm run lint` and `pnpm run typecheck` and fix any new errors before handing off.

## Conventions and gotchas
- Path aliases:
  - WebUI: `@/*` maps to `apps/webui/src/*`.
  - Server: `@/*` maps to `apps/server/src/*`.
- Server build emits ESM (`dist/index.js`).
- Stick to pnpm; `package-lock.json` is not used.
- When adding new API schemas, update `apps/server/src/index.ts` schema registration list.
- File routes depend on `FILE_STORE_PATH` and static file serving.
