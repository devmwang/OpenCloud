import { createMiddleware } from "@tanstack/react-start";

import { env } from "@/env";

export type NovaRequestContext = {
    requestOrigin: string;
    requestCookieHeader?: string;
};

const BOT_USER_AGENT_PATTERN =
    /(discordbot|slackbot|twitterbot|facebookexternalhit|facebot|linkedinbot|whatsapp|telegrambot)/i;

const getFileRouteIdFromPath = (pathname: string) => {
    const match = pathname.match(/^\/file\/([^/]+)$/);
    return match?.[1];
};

const forwardedHeaderNames = ["accept", "range", "if-none-match", "if-modified-since", "cookie", "user-agent"];

export const requestContextMiddleware = createMiddleware().server(({ request, next }) => {
    const requestUrl = new URL(request.url);

    return next({
        context: {
            requestOrigin: requestUrl.origin,
            requestCookieHeader: request.headers.get("cookie") ?? undefined,
        } satisfies NovaRequestContext,
    });
});

export const botFileProxyMiddleware = createMiddleware().server(async ({ request, next }) => {
    const requestUrl = new URL(request.url);
    const requestPathname = requestUrl.pathname;

    if (!requestPathname.startsWith("/file/")) {
        return next();
    }

    const userAgent = request.headers.get("user-agent") ?? "";
    if (!BOT_USER_AGENT_PATTERN.test(userAgent)) {
        return next();
    }

    const routeFileId = getFileRouteIdFromPath(requestPathname);
    if (!routeFileId) {
        return next();
    }

    const targetUrl = new URL(`/v1/files/get/${encodeURIComponent(routeFileId)}`, env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL);
    targetUrl.search = requestUrl.search;

    const headers = new Headers();
    for (const headerName of forwardedHeaderNames) {
        const headerValue = request.headers.get(headerName);
        if (headerValue) {
            headers.set(headerName, headerValue);
        }
    }

    const response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers,
    });

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
});
