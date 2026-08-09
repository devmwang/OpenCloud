# Environment Variables

Source of truth: `.env.example` (repo root).

## Local setup

Working directory: repo root.

- Copy: `Copy-Item .env.example .env`
- Fill in required values in `.env` (dotenvx root scripts load `.env*` using the Next.js convention).

## Variables

Server:

- `OPENCLOUD_WEBUI_URL`: allowed frontend origin for CORS and trusted origins (legacy variable name; set to the Nova origin)
- `COOKIE_URL`: optional when Nova and the API use one hostname; otherwise, the valid non-public-suffix parent of their direct subdomains; an optional leading dot is accepted and removed
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

Nova and the API origins must both use HTTP or both use HTTPS. When they use the same hostname, omit `COOKIE_URL` or set it to that exact hostname. OpenCloud uses a host-only session cookie in this mode, which supports `localhost` and IP addresses. When the hostnames differ, each one must be a direct subdomain of `COOKIE_URL`, and `COOKIE_URL` must be a valid domain that is not a public suffix. For example, use `opencloud.example.com` for `app.opencloud.example.com` and `api.opencloud.example.com`. Do not include a scheme, port, path, query, or fragment. The cookie name and Better Auth signing context are bound to the protocol and exact host or Domain scope. A scope change makes old credentials unusable and requires each user to sign in again.

Migration `0009_rotate_auth_session_cookie.sql` deletes sessions created before scope-bound cookie credentials. Stop the Server, apply migrations, and then start the updated Server. The supported Linux `update` and `rebuild` commands perform this sequence for `server` and `both` modes. Each user must sign in one time after this upgrade.
