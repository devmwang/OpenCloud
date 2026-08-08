import fs from "fs";
import path from "path";

import FastifyCookie from "@fastify/cookie";
import FastifyCORS from "@fastify/cors";
import FastifyHelmet from "@fastify/helmet";
import FastifyMultipart from "@fastify/multipart";
import FastifyRateLimit from "@fastify/rate-limit";
import FastifyStatic from "@fastify/static";
import Fastify from "fastify";

import { env } from "@/env/env";
import authRouter from "@/systems/auth/auth.routes";
import { authSchemas } from "@/systems/auth/auth.schemas";
import folderRouter from "@/systems/folder/folder.routes";
import { folderSchemas } from "@/systems/folder/folder.schemas";
import fileSystemRouter from "@/systems/fs/fs.routes";
import { fsSchemas } from "@/systems/fs/fs.schemas";
import recycleBinRouter from "@/systems/recycle-bin/recycle-bin.routes";
import { recycleBinSchemas } from "@/systems/recycle-bin/recycle-bin.schemas";
import uploadRouter from "@/systems/upload/upload.routes";
import { uploadSchemas } from "@/systems/upload/upload.schemas";
import accessControlPlugin from "@/utils/access-control";
import authenticationPlugin from "@/utils/authentication";
import betterAuthPlugin from "@/utils/better-auth";
import csrfPlugin from "@/utils/csrf";
import dbPlugin from "@/utils/db";
import hierarchyLockPlugin from "@/utils/hierarchy-lock";
import { getRateLimitKey, getRateLimitMax, getRateLimitTimeWindow } from "@/utils/rate-limit";

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
    logger: {
        serializers: {
            req(request) {
                const queryStart = request.url.indexOf("?");
                return {
                    method: request.method,
                    url: queryStart >= 0 ? request.url.slice(0, queryStart) : request.url,
                    host: request.hostname,
                    remoteAddress: request.ip,
                    ...(request.socket.remotePort !== undefined ? { remotePort: request.socket.remotePort } : {}),
                };
            },
        },
    },
    trustProxy: env.TRUST_PROXY_HOPS,
    connectionTimeout: env.CONNECTION_TIMEOUT_MS,
    requestTimeout: env.REQUEST_TIMEOUT_MS,
});

const ensureDirectoryExists = (directoryPath: string) => {
    try {
        fs.mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
        fs.chmodSync(directoryPath, 0o700);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw error;
        }

        if (!fs.statSync(directoryPath).isDirectory()) {
            throw error;
        }
    }
};

// Register Utility Plugins
void server.register(dbPlugin);
void server.register(hierarchyLockPlugin);
void server.register(FastifyCORS, {
    origin: env.OPENCLOUD_WEBUI_URL,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

void server.register(FastifyRateLimit, {
    // Run after onRequest hooks but before payload parsing.
    hook: "preParsing",
    keyGenerator: getRateLimitKey,
    max: getRateLimitMax,
    timeWindow: getRateLimitTimeWindow,
});

void server.register(betterAuthPlugin);
void server.register(authenticationPlugin);
void server.register(accessControlPlugin);

void server.register(FastifyCookie, {
    secret: env.AUTH_SECRET,
    parseOptions: {},
});

void server.register(FastifyHelmet, {
    crossOriginResourcePolicy: { policy: "cross-origin" },
});
void server.register(csrfPlugin);

void server.register(FastifyMultipart, {
    limits: {
        files: 1,
        fields: 0,
        parts: 1,
        fieldSize: 16 * 1024,
        fileSize: env.MAX_UPLOAD_SIZE_BYTES,
    },
});

const fileStoreRoot = path.resolve(env.FILE_STORE_PATH);
ensureDirectoryExists(fileStoreRoot);

void server.register(FastifyStatic, {
    root: fileStoreRoot,
    serve: false,
});

// Register Route Schemas
for (const schema of [...authSchemas, ...uploadSchemas, ...fsSchemas, ...folderSchemas, ...recycleBinSchemas]) {
    server.addSchema(schema);
}

// Register Routes
void server.register(authRouter, { prefix: "/v1" });
void server.register(uploadRouter, { prefix: "/v1" });
void server.register(fileSystemRouter, { prefix: "/v1" });
void server.register(folderRouter, { prefix: "/v1" });
void server.register(recycleBinRouter, { prefix: "/v1/recycle-bin" });

server.get(
    "/robots.txt",
    {
        config: {
            rateLimit: false,
        },
    },
    async (_request, reply) => {
        return reply
            .type("text/plain; charset=utf-8")
            .header("Cache-Control", "public, max-age=86400")
            .send(
                "User-agent: GPTBot\nDisallow: /v1/files/\n\nUser-agent: ClaudeBot\nDisallow: /v1/files/\n\nUser-agent: OAI-SearchBot\nDisallow: /v1/files/\n\nUser-agent: Claude-SearchBot\nDisallow: /v1/files/\n\nUser-agent: *\nAllow: /v1/files/\n",
            );
    },
);

// Server Health Check
server.get(
    "/v1/health",
    {
        config: {
            rateLimit: false,
        },
    },
    async () => {
        return { status: "OK" };
    },
);

server.setErrorHandler((error, request, reply) => {
    const errorObject = typeof error === "object" && error !== null ? error : null;
    const statusCode =
        errorObject && "statusCode" in errorObject && typeof errorObject.statusCode === "number"
            ? errorObject.statusCode
            : undefined;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
        const errorHeaders =
            errorObject &&
            "headers" in errorObject &&
            typeof errorObject.headers === "object" &&
            errorObject.headers !== null
                ? (errorObject.headers as Record<string, unknown>)
                : undefined;
        const contentRange = errorHeaders?.["content-range"] ?? errorHeaders?.["Content-Range"];
        if (typeof contentRange === "string") {
            void reply.header("Content-Range", contentRange);
        }
        void reply.header("Cache-Control", "private, no-store");
        void reply.header("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet, noimageindex");
        return reply.code(statusCode).send({
            error: error instanceof Error ? error.name : "Bad Request",
            message: error instanceof Error ? error.message : "The request could not be processed",
        });
    }

    request.log.error({ err: error }, "Unhandled request error");
    return reply.code(500).send({
        error: "Internal Server Error",
        message: "An unexpected error occurred",
    });
});

void (async () => {
    try {
        await server.listen({ host: SERVER_HOST, port: SERVER_PORT });
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
})();
