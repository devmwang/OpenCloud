# OpenCloud (Agent Guide)

OpenCloud is a Turborepo monorepo for a self-hosted cloud file server (Fastify API + Next.js WebUI).

## Tooling (repo-wide)

- Package manager/workspaces: pnpm (`pnpm-lock.yaml`, `pnpm-workspace.yaml`)
- Task runner: Turbo (`turbo.json`)
- Env loader used by root scripts: dotenvx (`package.json` scripts)
- Node: `>=22.12.0` (`package.json#engines`)

## Golden path commands (run from repo root)

- Install: `pnpm install`
- Dev: `pnpm run dev`
- Build: `pnpm run build`
- Start: `pnpm run start`
- Lint: `pnpm run lint`
- Typecheck: `pnpm run typecheck`
- Format: `pnpm run format`
- Tests: no repo-wide `test` script (yet)

## Repo structure (see per-package guides)

- Server app: [apps/server/AGENTS.md](apps/server/AGENTS.md)
- WebUI app: [apps/webui/AGENTS.md](apps/webui/AGENTS.md)
- Shared TS configs: [common/tsconfig/AGENTS.md](common/tsconfig/AGENTS.md)
- Shared ESLint config: [common/eslint-config-custom/AGENTS.md](common/eslint-config-custom/AGENTS.md)
- Shared agent docs: [docs/agents/README.md](docs/agents/README.md)
