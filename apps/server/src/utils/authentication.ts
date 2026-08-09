import FastifyJWT from "@fastify/jwt";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
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
            type: "UploadToken" | "ReadToken";
        };
        decoded: {
            id: string;
            type: "UploadToken" | "ReadToken";
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

type SetCookieHeaderSource = Headers;
type SessionResolvedRequest = FastifyRequest & {
    _authSessionResolved?: boolean;
};

const extractSetCookies = (headers: SetCookieHeaderSource) => {
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

const applySetCookieHeaders = (reply: FastifyReply, headers?: SetCookieHeaderSource | null) => {
    if (!headers) {
        return;
    }
    appendSetCookies(reply, extractSetCookies(headers));
};

const authenticationPlugin: FastifyPluginAsync = fp(async (server) => {
    void server.register(FastifyJWT, {
        secret: env.AUTH_SECRET,
    });

    const setBetterAuthSession = async (request: FastifyRequest, reply: FastifyReply) => {
        const statefulRequest = request as SessionResolvedRequest;
        if (statefulRequest._authSessionResolved) {
            return;
        }

        statefulRequest._authSessionResolved = true;
        request.authenticated = false;
        request.user = undefined;

        const { response, headers } = await server.betterAuth.api.getSession({
            headers: buildHeaders(request),
            returnHeaders: true,
        });

        applySetCookieHeaders(reply, headers);

        if (response?.session && response.user) {
            request.authenticated = true;
            request.user = { id: response.user.id };
        }
    };

    const ensureAuthenticated = (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.authenticated) {
            reply.code(401).send({ error: "Unauthorized" });
            return;
        }
    };

    // Make JWT verification/decode available through the fastify server instance: server.authentication
    server.decorate("authenticate", async function (request: FastifyRequest, reply: FastifyReply) {
        await setBetterAuthSession(request, reply);
        ensureAuthenticated(request, reply);
    });

    // Attempts to verify user but does not stop if verification fails (allows routes with optional authentication)
    server.decorate("optionalAuthenticate", async function (request: FastifyRequest, reply: FastifyReply) {
        await setBetterAuthSession(request, reply);
    });
});

export default authenticationPlugin;
