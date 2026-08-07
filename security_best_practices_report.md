# OpenCloud Security Review

Date: 2026-07-16

## Scope and method

This review covered the Fastify/Better Auth/PostgreSQL API, file upload and delivery paths, Nova/TanStack Start frontend and SSR middleware, authorization on every `/v1` route group, deployment units/scripts, environment handling, and the locked production dependency graph. It combined source review, dependency-level behavior checks, targeted runtime probes, and adversarial parallel review.

No direct cross-tenant IDOR, SQL injection, unsafe DOM HTML injection, committed credential, open redirect, or physical path traversal was found. The initially suspected generic uploaded-file stored XSS was disproved: the installed Fastify static stack served extensionless blobs as `application/octet-stream` with `nosniff`. The response path is now explicit and no longer depends on that incidental behavior.

## Fixed findings

### OC-SEC-001 — Credentialed CORS origin bypass (High)

The API accepted credentialed origins using unanchored loopback regular expressions, so an attacker-controlled origin containing `localhost` or `127.0.0.1` could match. Cross-subdomain cookies and the readable CSRF endpoint made this a potential authenticated cross-origin mutation chain.

Fixed in `apps/server/src/index.ts`: CORS now permits only the exact validated Nova origin. Server and UI origins are restricted to credential-free HTTP(S) origins.

### OC-SEC-002 — Multipart memory, disk, and socket exhaustion (High)

Unauthenticated multipart parsing allowed up to 1,000 parts before authorization, truncated oversized files could be marked ready, and valid uploads had no concurrency ceiling.

Fixed in `apps/server/src/index.ts` and `apps/server/src/systems/upload/upload.handlers.ts`: one-file/zero-field multipart limits, a configurable 1 GiB default maximum, upload-token authorization in a bounded header before body parsing, connection close on pre-body rejection, truncation detection with `413`, eight global/two-per-owner active-upload caps, finite server timeouts, exclusive `0600` file creation, and `0700` owner directories.

### OC-SEC-003 — Thumbnail cross-file disclosure and decode exhaustion (High)

Sharp opened an attacker-controlled SVG by filesystem path. librsvg can resolve same-directory references, allowing a public SVG to rasterize a known private sibling blob owned by the same account. Thumbnail work also had no byte, pixel, time, or concurrency bound.

Fixed in `apps/server/src/systems/fs/fs.handlers.ts`: bounded buffer input, magic-byte and decoded-format raster allowlists, SVG/XML rejection, fixed PNG output, 50 MiB/40 MP/5 second limits, and a four-job process cap.

### OC-SEC-004 — Capability and private-file disclosure through logs, caches, and metadata (High)

Bearer read tokens appeared in request URLs and were therefore logged. Private/protected file responses inherited public cache semantics. Nova repeated tokens in canonical/social metadata and could retain prior-account query data.

Fixed across `apps/server/src/index.ts`, `apps/server/src/systems/fs/fs.handlers.ts`, and Nova routes: query strings are omitted from request logs; private responses are `private, no-store`; content uses safe dispositions and byte-derived types; tokenized/protected pages are no-index and omit bearer URLs from metadata; login/logout/session loss clears the whole query cache; `/file` proxy responses are no-store and vary by user agent.

### OC-SEC-005 — Folder-cycle race and unbounded recursive traversal (High)

Concurrent inverse moves could both validate before writing, create a parent cycle, and feed it to `UNION ALL` recursive CTEs.

Fixed with PostgreSQL per-owner advisory locks and cycle-terminating `UNION` recursive CTEs. Folder, file-move/delete, purge, and recycle mutations take an exclusive lock; uploads take a shared lock through metadata creation, blob streaming, and the final `READY` transition, allowing concurrent uploads without permitting deletion underneath them. Advisory locks use a dedicated bounded pool, so locked operations do not consume the query pool they need to finish, and incompatible operations fail with `409`.

### OC-SEC-006 — Purge-blocking foreign keys (High)

Folder upload tokens used `ON DELETE RESTRICT`, so a user could make a deleted folder permanently unpurgeable. Composite `SET NULL` actions also attempted to null non-null ownership/key columns.

Fixed in schema and `0008_harden_folder_delete_foreign_keys.sql`: upload-token links cascade, while folder-parent and user-root relationships use `NO ACTION`. The replacement constraints are added `NOT VALID`, validated, then atomically renamed.

### OC-SEC-007 — Authentication enumeration, origin confusion, and weak throttling (Medium)

Better Auth exposed username availability, its production-dependent limiter was not explicitly enabled, and the adapter constructed auth URLs from client-controlled Host/forwarding headers.

Fixed in `apps/server/src/auth.ts` and `apps/server/src/utils/better-auth.ts`: enumeration is disabled; username sign-in is limited to five attempts per minute; the URL/Host/protocol are canonical; and all client-IP headers are overwritten with Fastify's trusted-proxy-resolved IP.

### OC-SEC-008 — Secret/configuration and frontend privacy defaults (Medium)

The known `AUTH_SECRET="CHANGE ME"` value was accepted; production Nova could silently target visitor localhost; Office preview automatically delegated protected documents and bearer tokens to Microsoft; provisioning accepted plaintext passwords in argv.

Fixed with fail-fast 32-character secret validation, an empty generation-guided example, production-required API origin, Office Online default-off configuration, hidden admin password prompting and normal length validation, broader env-file ignore rules, and systemd `UMask=0077`/`NoNewPrivileges=true`.

### OC-SEC-009 — Vulnerable dependency graph (Critical to Low)

The initial production audit reported 27 advisories, including critical/high Better Auth, Vite, Kysely, fast-uri, and Undici issues. Direct dependencies and scoped transitive overrides were updated. A new production audit on 2026-08-07 then found newer advisories in Seroval, Sharp, Fastify Static, Find My Way, and several forced overrides. Those packages were updated to patched versions. The final `pnpm audit --prod` reported no known vulnerabilities. The `brace-expansion` override remains scoped so legacy `minimatch@3.1.5` uses compatible patched `1.1.12`, while modern consumers use patched `5.0.9`.

## Residual risks and follow-up

1. **Linux maintenance trust chain (High, deployment-dependent):** the runtime user owns the checkout, while documentation tells administrators to execute its update script with `sudo` and install unit templates from it. A service compromise could become root at the next maintenance run. Move the privileged manager/templates to a root-owned immutable location and require a dedicated non-root service account.
2. **Blob/database purge atomicity (Medium availability):** large folder subtrees now use one cycle-safe folder delete statement, and scheduled purges isolate owner hierarchy operations. Blob deletion and database deletion still cannot share one transaction. Add a durable blob-cleanup outbox so database failures after an unlink can be repaired.
3. **Edge-level slow transfer controls (Medium):** application concurrency and time bounds are now finite, but production should still enforce connection counts, minimum upload/download rates, body limits, and response-idle timeouts at a reverse proxy.
4. **Nova CSP (Medium hardening):** anti-framing, `nosniff`, referrer, permissions, and sensitive-page cache headers are present. A strict CSP was intentionally not shipped until TanStack hydration scripts are wired to a verified per-request nonce; adding an unconnected nonce would break the application.
5. **Infrastructure assurance:** TLS termination, firewalling, live database roles, backups, external log redaction, reverse-proxy behavior, and hosted repository controls were outside the repository-only review.

## Deployment action required

The Linux service update and rebuild commands stop the server and run database migrations automatically. For other deployment methods, run the migration before relying on the FK fixes:

```powershell
pnpm --filter server db:migrate
```

Existing file stores should also be audited once for directory mode `0700` and blob mode `0600`; new data is created with those permissions automatically.
