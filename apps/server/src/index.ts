import fs from "fs";
import { createHash } from "node:crypto";
import path from "path";

import FastifyCookie from "@fastify/cookie";
import FastifyCORS from "@fastify/cors";
import FastifyHelmet from "@fastify/helmet";
import FastifyMultipart from "@fastify/multipart";
import FastifyRateLimit from "@fastify/rate-limit";
import FastifyStatic from "@fastify/static";
import Fastify, { type FastifyRequest } from "fastify";

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

export const SERVER_HOST = env.SERVER_HOST;
export const SERVER_PORT = env.SERVER_PORT;

// Fastify Types
declare module "fastify" {
    interface FastifyRequest {
        authenticated: boolean;
        rateLimitEvent?: "onExceeding" | "onExceeded";
        rateLimitKey?: string;
    }
}

const RATE_LIMIT_APPROACHING_THRESHOLD_PERCENT = 0.1;
const RATE_LIMIT_APPROACHING_THRESHOLD_MINIMUM = 20;
const READ_TOKEN_RATE_LIMIT_PATH = /^\/v1\/files\/[^/]+\/(content|thumbnail)$/;

const getRequestPath = (url: string) => {
    return url.split("?")[0] ?? url;
};

const getReadTokenFromQuery = (query: unknown) => {
    if (!query || typeof query !== "object") {
        return undefined;
    }

    const readToken = (query as { readToken?: string }).readToken;
    return typeof readToken === "string" && readToken.length > 0 ? readToken : undefined;
};

const getReadTokenFromUrl = (url: string) => {
    const queryStart = url.indexOf("?");
    if (queryStart === -1) {
        return undefined;
    }

    const readToken = new URLSearchParams(url.slice(queryStart + 1)).get("readToken");
    return typeof readToken === "string" && readToken.length > 0 ? readToken : undefined;
};

const getReadToken = (request: Pick<FastifyRequest, "url" | "query">) => {
    if (!READ_TOKEN_RATE_LIMIT_PATH.test(getRequestPath(request.url))) {
        return undefined;
    }

    return getReadTokenFromQuery(request.query) ?? getReadTokenFromUrl(request.url);
};

const getVerifiedReadTokenId = (request: Pick<FastifyRequest, "server">, readToken: string) => {
    try {
        const payload = request.server.jwt.verify<{ id?: string; type?: string }>(readToken);
        if (payload.type !== "ReadToken" || typeof payload.id !== "string" || payload.id.length === 0) {
            return undefined;
        }

        return payload.id;
    } catch {
        return undefined;
    }
};

const buildRateLimitKey = (request: Pick<FastifyRequest, "user" | "ip" | "url" | "query" | "server">) => {
    const userId = request.user?.id;
    if (typeof userId === "string" && userId.length > 0) {
        return `u:${userId}`;
    }

    const readToken = getReadToken(request);
    if (readToken) {
        const readTokenId = getVerifiedReadTokenId(request, readToken);
        if (readTokenId) {
            const readTokenHash = createHash("sha256").update(readTokenId).digest("hex").slice(0, 16);
            return `rt:${readTokenHash}`;
        }
    }

    return `ip:${request.ip}`;
};

const getRateLimitKeyType = (key?: string) => {
    if (!key) {
        return "unknown";
    }

    if (key.startsWith("u:")) {
        return "u";
    }
    if (key.startsWith("rt:")) {
        return "rt";
    }
    if (key.startsWith("ip:")) {
        return "ip";
    }

    return "unknown";
};

const parseHeaderNumber = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string") {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    if (Array.isArray(value) && value.length > 0) {
        return parseHeaderNumber(value[0]);
    }

    return undefined;
};

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
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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

let hasWarnedForProxyHeaders = false;
server.addHook("onRequest", async (request) => {
    if (hasWarnedForProxyHeaders || env.TRUST_PROXY_HOPS !== 0) {
        return;
    }

    const hasForwardedHeaders = Boolean(
        request.headers["x-forwarded-for"] ||
        request.headers["x-forwarded-proto"] ||
        request.headers["x-real-ip"] ||
        request.headers["cf-connecting-ip"],
    );

    if (!hasForwardedHeaders) {
        return;
    }

    hasWarnedForProxyHeaders = true;
    server.log.warn(
        {
            route: request.url,
            method: request.method,
            trustProxyHops: env.TRUST_PROXY_HOPS,
        },
        "Forwarded proxy headers detected while TRUST_PROXY_HOPS is 0; client identity controls may be inaccurate.",
    );
});

void server.register(FastifyRateLimit, {
    max: env.RATE_LIMIT_GLOBAL_MAX,
    timeWindow: env.RATE_LIMIT_GLOBAL_WINDOW,
    hook: "onRequest",
    keyGenerator: (request) => buildRateLimitKey(request),
    onExceeding: (request, key) => {
        request.rateLimitEvent = "onExceeding";
        request.rateLimitKey = String(key);
    },
    onExceeded: (request, key) => {
        request.rateLimitEvent = "onExceeded";
        request.rateLimitKey = String(key);
    },
});

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

server.addHook("onResponse", async (request, reply) => {
    const event = request.rateLimitEvent;
    if (!event) {
        return;
    }

    const limit = parseHeaderNumber(reply.getHeader("x-ratelimit-limit"));
    const remaining = parseHeaderNumber(reply.getHeader("x-ratelimit-remaining"));
    const ttlSeconds = parseHeaderNumber(reply.getHeader("x-ratelimit-reset"));

    if (event === "onExceeding" && limit !== undefined && remaining !== undefined) {
        const threshold = Math.max(
            Math.ceil(limit * RATE_LIMIT_APPROACHING_THRESHOLD_PERCENT),
            RATE_LIMIT_APPROACHING_THRESHOLD_MINIMUM,
        );

        if (remaining > threshold) {
            return;
        }
    }

    const payload = {
        route: request.routeOptions?.url ?? request.url.split("?")[0],
        method: request.method,
        ip: request.ip,
        userId: request.user?.id ?? null,
        keyType: getRateLimitKeyType(request.rateLimitKey),
        limit: limit ?? null,
        remaining: remaining ?? null,
        ttlSeconds: ttlSeconds ?? null,
    };

    if (event === "onExceeded") {
        server.log.warn(payload, "Rate limit exceeded");
        return;
    }

    server.log.info(payload, "Rate limit nearing threshold");
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
