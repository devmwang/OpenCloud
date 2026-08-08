import { createMiddleware } from "@tanstack/react-start";

import { env } from "@/env";
import { stripFileRouteExtension } from "@/lib/file-id";

export type NovaRequestContext = {
    requestOrigin: string;
    requestCookieHeader?: string;
};

const DIRECT_FILE_USER_AGENT_PATTERN =
    /(chatgpt-user|claude-user|discordbot|slackbot|twitterbot|facebookexternalhit|facebot|linkedinbot|whatsapp|telegrambot)/i;

const getFileRouteIdFromPath = (pathname: string) => {
    const match = pathname.match(/^\/file\/([^/]+)$/);
    if (!match?.[1]) {
        return undefined;
    }

    try {
        return decodeURIComponent(match[1]);
    } catch {
        return undefined;
    }
};

const appendVary = (headers: Headers, value: string) => {
    const values = (headers.get("vary") ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

    if (!values.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
        values.push(value);
    }

    headers.set("vary", values.join(", "));
};

const applySecurityHeaders = (response: Response, isFileRoute: boolean) => {
    const headers = new Headers(response.headers);

    headers.set("permissions-policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
    headers.set("referrer-policy", "no-referrer");
    headers.set("x-content-type-options", "nosniff");
    headers.set("x-frame-options", "DENY");

    if (isFileRoute) {
        headers.set("cache-control", "private, no-store");
        headers.set("pragma", "no-cache");
        headers.set("x-robots-tag", "noindex, nofollow, noarchive, nosnippet, noimageindex");
        appendVary(headers, "User-Agent");
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
};

export const requestContextMiddleware = createMiddleware().server(async ({ request, next }) => {
    const requestUrl = new URL(request.url);

    const result = await next({
        context: {
            requestOrigin: requestUrl.origin,
            requestCookieHeader: request.headers.get("cookie") ?? undefined,
        } satisfies NovaRequestContext,
    });

    return applySecurityHeaders(result.response, requestUrl.pathname.startsWith("/file/"));
});

export const agentFileRedirectMiddleware = createMiddleware().server(async ({ request, next }) => {
    const requestUrl = new URL(request.url);
    const requestPathname = requestUrl.pathname;

    if (!requestPathname.startsWith("/file/")) {
        return next();
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
        return next();
    }

    const userAgent = request.headers.get("user-agent") ?? "";
    if (!DIRECT_FILE_USER_AGENT_PATTERN.test(userAgent)) {
        return next();
    }

    const routeFileId = getFileRouteIdFromPath(requestPathname);
    if (!routeFileId) {
        return next();
    }
    const fileId = stripFileRouteExtension(routeFileId);
    if (!fileId) {
        return next();
    }

    const targetUrl = new URL(`/v1/files/${encodeURIComponent(fileId)}/content`, env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL);
    const readToken = requestUrl.searchParams.get("readToken");
    if (readToken) {
        targetUrl.searchParams.set("readToken", readToken);
    }

    const responseHeaders = new Headers({ location: targetUrl.toString() });
    responseHeaders.set("cache-control", "private, no-store");
    responseHeaders.set("pragma", "no-cache");
    appendVary(responseHeaders, "User-Agent");

    return new Response(null, {
        status: 307,
        headers: responseHeaders,
    });
});
