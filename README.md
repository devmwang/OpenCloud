# OpenCloud

OpenCloud is a free, open-source, and self-hosted cloud file server and management system. OpenCloud works similarly to other cloud file providers, like iCloud, OneDrive, or Google Drive.

## Hosting

### Ubuntu Server 24.04 LTS

The supported Linux deployment runs the built Server and Nova outputs under PM2. It does not run the root Turbo start task under PM2.

From a configured checkout, run:

```bash
./scripts/linux/deploy.sh
```

See [Deploy OpenCloud on Ubuntu Server 24.04 LTS](docs/deployment/ubuntu-pm2.md) for prerequisites, the first deployment, updates, PM2 startup persistence, migration failure behavior, and the one-time transition from old supervisors.

### Nova Client

There are two options: Automatic hosting using Vercel or local self-hosting.

#### Option 1: Automatic Hosting with Vercel

Create a Vercel project with root directory set to `apps/nova`. Use the Nitro build preset. Configure these Vercel environment variables:

- `NEXT_PUBLIC_OPENCLOUD_SERVER_URL` (required): public URL of the OpenCloud API server.
- `NEXT_PUBLIC_FILE_PURGE_RETENTION_DAYS` (optional): defaults to `30`.
- `OPENCLOUD_WEBUI_URL` (recommended): canonical public frontend origin (legacy variable name retained for compatibility; set this to your Nova URL).

Also configure the backend server so Nova can authenticate successfully:

- `OPENCLOUD_WEBUI_URL` must include your deployed Nova origin for CORS and trusted origins.
- `COOKIE_URL` must match your cookie domain strategy.

#### Option 2: Local Development and Preview

These commands do not replace the supported Ubuntu PM2 deployment. For local development, run `pnpm run dev --filter=nova` (Vite default `localhost:5173`). To preview the production output locally, run `pnpm run build --filter=nova` and then `pnpm run start --filter=nova`.

## OpenCloud System Architecture

### Server

The [backend server](https://github.com/devmwang/OpenCloud/tree/main/apps/server) is built using [TypeScript](https://www.typescriptlang.org/docs/), [Fastify](https://www.fastify.io/docs/latest/), [Drizzle ORM](https://orm.drizzle.team/), [argon2](https://www.npmjs.com/package/argon2), and [Zod](https://zod.dev/).

### Client

- The [Nova client](https://github.com/devmwang/OpenCloud/tree/main/apps/nova) is built using [TypeScript](https://www.typescriptlang.org/docs/), [TanStack Start](https://tanstack.com/start), [TanStack Router](https://tanstack.com/router), [TanStack Query](https://tanstack.com/query), and [React](https://reactjs.org/).

### Server-Client Communication

OpenCloud clients communicate with the backend server using the OpenCloud Server REST API.

### Authentication Mechanism

OpenCloud uses a token-based authentication system. On login, this server return an access-token and refresh-token. The access-token only provides access to protected resources for 15 minutes. Just prior to access-token expiration, the client will preemptively fetch a new token using the refresh-token, which has a 1 week lifespan. To protect the account in the event of a compromised refresh-token, this system implements refresh-token rotation and automatic refresh-token reuse detection. This mechanism is outlined in [this blog post](https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/) by the team at Auth0.

## Legal

OpenCloud is distributed under the AGPL v3.0 license.
