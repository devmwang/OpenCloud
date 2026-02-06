import fs from "fs";
import path from "path";

import FastifyCookie from "@fastify/cookie";
import FastifyCORS from "@fastify/cors";
import FastifyHelmet from "@fastify/helmet";
import FastifyMultipart from "@fastify/multipart";
import FastifyRateLimit from "@fastify/rate-limit";
import FastifyRedis from "@fastify/redis";
import FastifyStatic from "@fastify/static";
import Fastify from "fastify";

import { env } from "@/env/env";
import authRouter from "@/systems/auth/auth.routes";
import { authSchemas } from "@/systems/auth/auth.schemas";
import folderRouter from "@/systems/folder/folder.routes";
import { folderSchemas } from "@/systems/folder/folder.schemas";
import fileSystemRouter from "@/systems/fs/fs.routes";
import { fsSchemas } from "@/systems/fs/fs.schemas";
import uploadRouter from "@/systems/upload/upload.routes";
import { uploadSchemas } from "@/systems/upload/upload.schemas";
import accessControlPlugin from "@/utils/access-control";
import authenticationPlugin from "@/utils/authentication";
import betterAuthPlugin from "@/utils/better-auth";
import csrfPlugin from "@/utils/csrf";
import dbPlugin from "@/utils/db";

export const SERVER_HOST = env.SERVER_HOST;
export const SERVER_PORT = env.SERVER_PORT;

// Fastify Types
declare module "fastify" {
    interface FastifyRequest {
        authenticated: boolean;
    }
}

// Initialize Fastify Instance
const server = Fastify({
    logger: true,
    trustProxy: env.TRUST_PROXY_HOPS,
});

// Register Utility Plugins
void server.register(dbPlugin);
void server.register(FastifyCORS, {
    origin: [/localhost(?::\d{1,5})?/, /127\.0\.0\.1(?::\d{1,5})?/, env.OPENCLOUD_WEBUI_URL],
    credentials: true,
});
void server.register(betterAuthPlugin);
void server.register(authenticationPlugin);
void server.register(accessControlPlugin);

void server.register(FastifyCookie, {
    secret: env.AUTH_SECRET,
    parseOptions: {},
});

void server.register(FastifyHelmet);
void server.register(csrfPlugin);

if (env.RATE_LIMIT_REDIS_URL) {
    void server.register(FastifyRedis, { url: env.RATE_LIMIT_REDIS_URL });
    void server.after((error) => {
        if (error) {
            throw error;
        }

        void server.register(FastifyRateLimit, {
            max: 1000,
            timeWindow: "1 minute",
            redis: server.redis,
        });
    });
} else {
    void server.register(FastifyRateLimit, {
        max: 1000,
        timeWindow: "1 minute",
    });
}

void server.register(FastifyMultipart, {
    limits: {
        fileSize: 10 * 1024 * 1024 * 1024, // 10 GB
    },
});

const fileStoreRoot = path.resolve(env.FILE_STORE_PATH);
if (!fs.existsSync(fileStoreRoot)) {
    fs.mkdirSync(fileStoreRoot, { recursive: true });
}

void server.register(FastifyStatic, {
    root: fileStoreRoot,
    serve: false,
});

// Register Route Schemas
for (const schema of [...authSchemas, ...uploadSchemas, ...fsSchemas, ...folderSchemas]) {
    server.addSchema(schema);
}

// Register Routes
void server.register(authRouter, { prefix: "/v1/auth" });
void server.register(uploadRouter, { prefix: "/v1/upload" });
void server.register(fileSystemRouter, { prefix: "/v1/files" });
void server.register(folderRouter, { prefix: "/v1/folder" });

// Server Health Check
server.get("/v1/health", async () => {
    return { status: "OK" };
});

void (async () => {
    try {
        await server.listen({ host: SERVER_HOST, port: SERVER_PORT });
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
})();
