# Workspace Command Patterns

Working directory: repo root.

## Repo-wide scripts (preferred)

These root scripts wrap Turbo with dotenvx (see `package.json`):

- Dev all packages: `pnpm run dev`
- Build all packages: `pnpm run build`
- Start all packages: `pnpm run start`

Filter a single package with Turbo (args are forwarded to `turbo`):

- `pnpm run dev -- --filter=server`
- `pnpm run dev -- --filter=webui`
- `pnpm run dev -- --filter=nova`

## Run a single package script (pnpm filter)

Use this for package-specific scripts (example: DB tooling):

- `pnpm --filter server db:migrate`
- `pnpm --filter webui lint`
- `pnpm --filter nova lint`

If the script requires `.env*` variables, wrap with dotenvx:

- `dotenvx run --convention=nextjs -- pnpm --filter server db:migrate`
