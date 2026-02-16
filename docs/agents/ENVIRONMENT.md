# Environment Variables

Source of truth: `.env.example` (repo root).

## Local setup

Working directory: repo root.

- Copy: `Copy-Item .env.example .env`
- Fill in required values in `.env` (dotenvx root scripts load `.env*` using the Next.js convention).

## Variables

Server:

- `OPENCLOUD_WEBUI_URL`: allowed frontend origin for CORS and trusted origins (legacy variable name; set to the Nova origin)
- `COOKIE_URL`: cookie domain
- `AUTH_SECRET`: signing secret
- `DATABASE_URL`: Postgres connection string
- `FILE_STORE_PATH`: directory for stored files
- `SERVER_HOST`: host interface for the API server (default `0.0.0.0`)
- `SERVER_PORT`: port for the API server (default `8080`)
- `TRUST_PROXY_HOPS`: number of trusted proxy hops (default `0`)
- `FILE_PURGE_RETENTION_DAYS`: recycle-bin retention window before permanent purge (default `30`)
- `RATE_LIMIT_AUTH_MAX_PER_MINUTE`: max requests per minute for `/api/auth/*` routes (default `240`)
- `RATE_LIMIT_ASSET_READ_MAX_PER_MINUTE`: max requests per minute for file content/thumbnail reads (default `6000`)
- `RATE_LIMIT_READ_MAX_PER_MINUTE`: max requests per minute for other read routes (default `3000`)
- `RATE_LIMIT_MUTATION_MAX_PER_MINUTE`: max requests per minute for write routes (default `600`)

Web frontend (Nova):

- `NEXT_PUBLIC_OPENCLOUD_SERVER_URL`: base URL for the API server (used by Nova and by the Server for Better Auth `baseURL`)
- `OPENCLOUD_WEBUI_URL`: canonical public frontend origin (legacy variable name retained for compatibility) used by the Server and Nova canonical URL fallback
