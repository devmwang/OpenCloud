# Shared TSConfig (common/tsconfig)

This workspace package provides shared `tsconfig` base presets used by apps/packages.

## Files
- Base: `common/tsconfig/base.json`
- Server preset: `common/tsconfig/server.json` (used by `apps/server/tsconfig.json`)
- Next.js preset: `common/tsconfig/nextjs.json` (used by `apps/webui/tsconfig.json`)
- React library preset: `common/tsconfig/react-library.json`

## Conventions
- Prefer extending one of the shared presets instead of duplicating compiler options across packages.
- When changing shared TS config, run a workspace typecheck from repo root: `pnpm run typecheck`.
