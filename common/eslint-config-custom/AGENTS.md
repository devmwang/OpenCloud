# Shared ESLint Config (common/eslint-config-custom)

Workspace ESLint flat config composition shared by apps/packages.

## Files
- Base export: `common/eslint-config-custom/index.js`
- Workspace composition + server type-aware rules: `eslint.config.js`

## Conventions
- Keep `common/eslint-config-custom/index.js` broadly applicable; put app-specific rules in the consuming app or root `eslint.config.js`.
- After changing ESLint config, run from repo root:
  - `pnpm run lint`
  - `pnpm run typecheck`
