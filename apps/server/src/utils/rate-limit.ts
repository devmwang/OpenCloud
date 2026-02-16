import type { FastifyRequest } from "fastify";

import { env } from "@/env/env";

export type RateLimitBucket = "auth" | "asset_read" | "read" | "mutation";

const ONE_MINUTE_MS = 60 * 1000;
const READ_METHODS = new Set(["GET", "HEAD"]);
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ASSET_READ_PATH_PATTERN = /^\/v1\/files\/[^/]+\/(content|thumbnail)$/;

const RATE_LIMIT_MAX_BY_BUCKET: Record<RateLimitBucket, number> = {
    auth: env.RATE_LIMIT_AUTH_MAX_PER_MINUTE,
    asset_read: env.RATE_LIMIT_ASSET_READ_MAX_PER_MINUTE,
    read: env.RATE_LIMIT_READ_MAX_PER_MINUTE,
    mutation: env.RATE_LIMIT_MUTATION_MAX_PER_MINUTE,
};

const RATE_LIMIT_WINDOW_BY_BUCKET: Record<RateLimitBucket, number> = {
    auth: ONE_MINUTE_MS,
    asset_read: ONE_MINUTE_MS,
    read: ONE_MINUTE_MS,
    mutation: ONE_MINUTE_MS,
};

const getPathname = (request: FastifyRequest) => {
    const rawUrl = request.raw.url ?? request.url;
    const queryStart = rawUrl.indexOf("?");
    return queryStart >= 0 ? rawUrl.slice(0, queryStart) : rawUrl;
};

const isAuthRequest = (routePath: string, pathname: string) => {
    return routePath === "/api/auth/*" || routePath.startsWith("/api/auth/") || pathname.startsWith("/api/auth/");
};

const isAssetReadRequest = (routePath: string, pathname: string, method: string) => {
    if (!READ_METHODS.has(method)) {
        return false;
    }

    if (routePath.endsWith("/files/:fileId/content") || routePath.endsWith("/files/:fileId/thumbnail")) {
        return true;
    }

    return ASSET_READ_PATH_PATTERN.test(pathname);
};

export const getRateLimitBucket = (request: FastifyRequest): RateLimitBucket => {
    const method = request.method.toUpperCase();
    const routePath = request.routeOptions.url ?? "";
    const pathname = getPathname(request);

    if (isAuthRequest(routePath, pathname)) {
        return "auth";
    }

    if (isAssetReadRequest(routePath, pathname, method)) {
        return "asset_read";
    }

    if (MUTATION_METHODS.has(method)) {
        return "mutation";
    }

    return "read";
};

export const getRateLimitMax = (request: FastifyRequest) => {
    return RATE_LIMIT_MAX_BY_BUCKET[getRateLimitBucket(request)];
};

export const getRateLimitTimeWindow = (request: FastifyRequest) => {
    return RATE_LIMIT_WINDOW_BY_BUCKET[getRateLimitBucket(request)];
};

export const getRateLimitKey = (request: FastifyRequest) => {
    const bucket = getRateLimitBucket(request);
    const userId = request.user?.id;
    const identity = typeof userId === "string" && userId.length > 0 ? `user:${userId}` : `ip:${request.ip}`;
    return `${bucket}:${identity}`;
};
