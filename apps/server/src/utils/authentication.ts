import type { FastifyRequest, FastifyReply, FastifyPluginAsync } from "fastify";
import FastifyJWT from "@fastify/jwt";
import fp from "fastify-plugin";

import { env } from "@/env/env";

// Use TypeScript module augmentation to declare the type of server.authenticate to be JWT authentication function
declare module "fastify" {
    interface FastifyInstance {
        authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
        optionalAuthenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    }

    interface FastifyRequest {
        authenticated: boolean;
    }
}

declare module "@fastify/jwt" {
    interface FastifyJWT {
        payload: {
            id: string;
            type: "UploadToken";
        };
        decoded: {
            id: string;
            type: "UploadToken";
            iat: number;
            exp: number;
        };
        user: { id: string } | undefined;
    }
}

const buildHeaders = (request: FastifyRequest) => {
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
    return headers;
};

const applySetCookieHeaders = (reply: FastifyReply, headers?: Headers | null) => {
    if (!headers) {
        return;
    }
    const setCookies = headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
        reply.header("set-cookie", setCookies);
    }
};

const authenticationPlugin: FastifyPluginAsync = fp(async (server) => {
    void server.register(FastifyJWT, {
        secret: env.AUTH_SECRET,
    });

    const setBetterAuthSession = async (request: FastifyRequest, reply: FastifyReply, required: boolean) => {
        request.authenticated = false;
        request.user = undefined;

        if (!server.betterAuth) {
            if (required) {
                reply.code(500).send({ error: "Auth not configured" });
            }
            return;
        }

        try {
            const { response, headers } = await server.betterAuth.api.getSession({
                headers: buildHeaders(request),
                returnHeaders: true,
            });

            applySetCookieHeaders(reply, headers);

            if (response?.session && response?.user) {
                request.authenticated = true;
                request.user = { id: response.user.id };
                return;
            }
        } catch (err) {
            request.authenticated = false;
            request.user = undefined;
        }

        if (required) {
            reply.code(401).send({ error: "Unauthorized" });
        }
    };

    // Make JWT verification/decode available through the fastify server instance: server.authentication
    server.decorate("authenticate", async function (request: FastifyRequest, reply: FastifyReply) {
        await setBetterAuthSession(request, reply, true);
    });

    // Attempts to verify user but does not stop if verification fails (allows routes with optional authentication)
    server.decorate("optionalAuthenticate", async function (request: FastifyRequest, reply: FastifyReply) {
        await setBetterAuthSession(request, reply, false);
    });
});

export default authenticationPlugin;
