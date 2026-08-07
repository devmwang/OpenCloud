import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import { createAuth, type AuthInstance } from "@/auth";
import { env } from "@/env/env";

declare module "fastify" {
    interface FastifyInstance {
        betterAuth: AuthInstance;
    }
}

const authBaseUrl = new URL(env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL);

const buildCanonicalAuthUrl = (requestUrl: string) => {
    const incomingUrl = new URL(requestUrl, "http://opencloud.invalid");
    const authUrl = new URL(authBaseUrl);
    authUrl.pathname = incomingUrl.pathname;
    authUrl.search = incomingUrl.search;
    authUrl.hash = "";
    return authUrl;
};

const buildAuthRequest = (request: FastifyRequest) => {
    const url = buildCanonicalAuthUrl(request.url);

    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
        if (typeof value === "undefined") {
            continue;
        }
        if (Array.isArray(value)) {
            for (const entry of value) {
                headers.append(key, entry);
            }
        } else {
            headers.set(key, value);
        }
    }

    headers.set("host", authBaseUrl.host);
    headers.set("x-forwarded-host", authBaseUrl.host);
    headers.set("x-forwarded-proto", authBaseUrl.protocol.slice(0, -1));
    headers.set("x-forwarded-for", request.ip);
    headers.set("x-real-ip", request.ip);
    headers.set("cf-connecting-ip", request.ip);
    headers.delete("forwarded");
    headers.delete("x-forwarded-port");

    let body: RequestInit["body"];
    if (!["GET", "HEAD"].includes(request.method) && request.body !== undefined) {
        if (typeof request.body === "string" || Buffer.isBuffer(request.body)) {
            body = request.body;
        } else {
            body = JSON.stringify(request.body);
            headers.set("content-type", "application/json");
        }
    }

    const init: RequestInit = {
        method: request.method,
        headers,
    };
    if (body !== undefined) {
        init.body = body;
    }

    return new Request(url.toString(), init);
};

const extractResponseSetCookies = (headers: Headers) => {
    return headers.getSetCookie();
};

const appendSetCookies = (reply: FastifyReply, setCookies: string[]) => {
    if (setCookies.length === 0) {
        return;
    }

    const existing = reply.getHeader("set-cookie");
    const existingValues = Array.isArray(existing) ? existing : typeof existing === "string" ? [existing] : [];

    reply.header("set-cookie", [...existingValues, ...setCookies]);
};

const applyAuthResponse = async (reply: FastifyReply, response: Response) => {
    reply.code(response.status);

    response.headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") {
            return;
        }
        reply.header(key, value);
    });

    appendSetCookies(reply, extractResponseSetCookies(response.headers));

    const payload = await response.arrayBuffer();
    if (payload.byteLength > 0) {
        reply.send(Buffer.from(payload));
        return;
    }

    reply.send();
};

const betterAuthPlugin: FastifyPluginAsync = fp(async (server) => {
    const auth = createAuth(server.db);
    server.decorate("betterAuth", auth);

    server.route({
        method: ["GET", "POST", "OPTIONS"],
        url: "/api/auth/*",
        handler: async (request, reply) => {
            const authRequest = buildAuthRequest(request);
            const authResponse = await auth.handler(authRequest);
            await applyAuthResponse(reply, authResponse);
        },
    });
});

export default betterAuthPlugin;
