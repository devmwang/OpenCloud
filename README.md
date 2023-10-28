# OpenCloud

OpenCloud is a free, open-source, and self-hosted cloud file server and management system. OpenCloud works similarly to other cloud file providers, like iCloud, OneDrive, or Google Drive.

## Hosting

### Server and WebUI on the same Server

Clone the repository and install dependencies. Copy the `.env.example` file to `.env` and fill in the required values. Generate the Prisma client with `pnpm exec dotenv -- "pnpm --filter server run db:generate"`. Then, run the server and webui using `pnpm run start`. You can also use a command line tool like [pm2](https://pm2.keymetrics.io/docs/usage/quick-start/) to run the server and webui in the background (with `pm2 start "pnpm run start"`). The server will be available at `localhost:8080`. WebUI will be available at `localhost:3000`.

### Server Only

Clone the repository and install dependencies. Copy the `.env.example` file to `.env` and fill in the required values. Generate the Prisma client with `pnpm exec dotenv -- "pnpm --filter server run db:generate"`. Then, run the server using `pnpm run start --filter server`. You can also use a command line tool like [pm2](https://pm2.keymetrics.io/docs/usage/quick-start/) to run the server in the background (with `pm2 start "pnpm run start --filter server"`). The server will be available at `localhost:8080`.

### WebUI Client Only

There are two options: Automatic hosting using Vercel or local self-hosting.

#### Option 1: Automatic Hosting with Vercel

Fork the repository and create a new project on [Vercel](https://vercel.com). Connect the project to your forked repository. Copy the `.env.example` file into the deployment configuration panel and fill in the required values. Then, deploy the project. The web client will be available at the domain you select in the Vercel control panel. Ensure that the domain you use is listed in the `OPENCLOUD_WEBUI_URL` environment variable in the server configuration for CORS to work correctly on the server.

#### Option 2: Local Self-Hosting

Clone the repository and install dependencies. Copy the `.env.example` file to `.env` and fill in the required values. Then, run WebUI using `pnpm run start --filter webui`. You can also use a command line tool like [pm2](https://pm2.keymetrics.io/docs/usage/quick-start/) to run WebUI in the background (with `pm2 start "pnpm run start --filter webui"`). WebUI will be available at `127.0.0.1:3000` (or `localhost:3000`).

## OpenCloud System Architecture

### Server

The [backend server](https://github.com/Controllyx/OpenCloud/tree/main/apps/server) is built using [TypeScript](https://www.typescriptlang.org/docs/), [Fastify](https://www.fastify.io/docs/latest/), [Prisma](https://www.prisma.io/docs), [argon2](https://www.npmjs.com/package/argon2), and [Zod](https://zod.dev/).

### Client

The [web client (WebUI)](https://github.com/Controllyx/OpenCloud/tree/main/apps/webui) is built using [TypeScript](https://www.typescriptlang.org/docs/), [Next.js](https://nextjs.org), [React](https://reactjs.org/), [Tailwind](https://tailwindcss.com/), [Zod](https://zod.dev/), [Framer Motion](https://www.framer.com/motion/), and [shadcn/ui](https://ui.shadcn.com/docs).

### Server-Client Communication

OpenCloud clients communicate with the backend server using the OpenCloud Server REST API.

### Authentication Mechanism

OpenCloud uses a token-based authentication system. On login, this server return an access-token and refresh-token. The access-token only provides access to protected resources for 15 minutes. Just prior to access-token expiration, the client will preemptively fetch a new token using the refresh-token, which has a 1 week lifespan. To protect the account in the event of a compromised refresh-token, this system implements refresh-token rotation and automatic refresh-token reuse detection. This mechanism is outlined in [this blog post](https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/) by the team at Auth0.

## Legal

OpenCloud is developed and maintained by Controllyx. OpenCloud is distributed under the AGPL v3.0 license.
