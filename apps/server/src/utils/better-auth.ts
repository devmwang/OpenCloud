import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import { createAuth, type AuthInstance } from "@/auth";

declare module "fastify" {
    interface FastifyInstance {
        betterAuth: AuthInstance;
    }
}

const getHeaderValue = (value: string | string[] | undefined) => {
    if (!value) {
        return undefined;
    }
    return Array.isArray(value) ? value[0] : value;
};

const buildAuthRequest = (request: FastifyRequest) => {
    const host = getHeaderValue(request.headers.host) ?? "localhost";
    const forwardedProto = getHeaderValue(request.headers["x-forwarded-proto"]);
    const protocol = forwardedProto ?? request.protocol ?? "http";
    const url = new URL(request.url, `${protocol}://${host}`);

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
    const headerApi = headers as { getSetCookie?: () => string[]; get?: (name: string) => string | null };
    if (typeof headerApi.getSetCookie === "function") {
        const setCookies = headerApi.getSetCookie();
        if (setCookies.length > 0) {
            return setCookies;
        }
    }

    const fallback = headerApi.get ? headerApi.get("set-cookie") : headers.get("set-cookie");
    return fallback ? [fallback] : [];
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
