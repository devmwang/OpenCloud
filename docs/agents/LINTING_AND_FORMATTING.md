# Linting, Formatting, Typechecking

Working directory: repo root.

## Commands
- Lint (Turbo): `pnpm run lint`
- Typecheck (Turbo): `pnpm run typecheck`
- Format (Prettier): `pnpm run format`

## Notes
- ESLint uses a flat config at `eslint.config.js`, composed from `common/eslint-config-custom`.
- `apps/server` currently has no `lint` script, so `pnpm run lint` only runs on packages that define `lint` (for example `apps/webui`).
