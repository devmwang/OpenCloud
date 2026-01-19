# Runtime Architecture (High Level)

- WebUI calls the Server over the REST API under `/v1/*`.
- Auth is cookie-based JWT:
  - `AccessToken` (short-lived, ~15m)
  - `RefreshToken` (long-lived, ~7d) with rotation
- Files are stored on disk under `FILE_STORE_PATH` and served both via API routes and Fastify static (`/FileStore/`).
