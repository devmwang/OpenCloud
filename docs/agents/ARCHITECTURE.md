# Runtime Architecture (High Level)

- Both WebUI (`apps/webui`) and Nova (`apps/nova`) call the Server over the REST API under `/v1/*`.
- Auth uses Better Auth session cookies (default session cookie names) via `/api/auth/*`.
- Files are stored on disk under `FILE_STORE_PATH` and served via API routes (`/v1/files/*`) and Fastify static (`/FileStore/`).
