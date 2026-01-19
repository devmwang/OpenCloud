# Environment Variables

Source of truth: `.env.example` (repo root).

## Local setup
Working directory: repo root.

- Copy: `Copy-Item .env.example .env`
- Fill in required values in `.env` (dotenvx root scripts load `.env*` using the Next.js convention).

## Variables
Server:
- `OPENCLOUD_WEBUI_URL`: allowed WebUI origin for CORS
- `COOKIE_URL`: cookie domain
- `AUTH_SECRET`: signing secret
- `DATABASE_URL`: Postgres connection string
- `FILE_STORE_PATH`: directory for stored files (served under `/FileStore/`)

WebUI:
- `NEXT_PUBLIC_OPENCLOUD_SERVER_URL`: base URL for the API server (used by Next.js runtime + `next.config.mjs`)
