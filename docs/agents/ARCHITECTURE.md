# Runtime Architecture (High Level)

- WebUI calls the Server over the REST API under `/v1/*`.
- Auth uses Better Auth session cookies (default session cookie names).
- Files are stored on disk under `FILE_STORE_PATH` and served both via API routes and Fastify static (`/FileStore/`).
