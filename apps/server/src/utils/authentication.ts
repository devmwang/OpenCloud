import type { FastifyRequest, FastifyReply, FastifyPluginAsync } from "fastify";
import FastifyJWT from "@fastify/jwt";
import fp from "fastify-plugin";

import { env } from "@/env/env";

// Use TypeScript module augmentation to declare the type of server.authenticate to be JWT authentication function
declare module "fastify" {
    interface FastifyInstance {
        authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
        optionalAuthenticate(request: FastifyRequest): Promise<void>;
    }
}

declare module "@fastify/jwt" {
    interface FastifyJWT {
        payload: {
            id: string;
            type: "AccessToken" | "RefreshToken" | "UploadToken";
        };
        decoded: {
            id: string;
            type: "AccessToken" | "RefreshToken" | "UploadToken";
            iat: number;
            exp: number;
        };
        user: {
            id: string;
        };
    }
}

const authenticationPlugin: FastifyPluginAsync = fp(async (server) => {
    void server.register(FastifyJWT, {
        secret: env.AUTH_SECRET,
        cookie: {
            cookieName: "AccessToken",
            signed: false,
        },
    });

    // Make JWT verification/decode available through the fastify server instance: server.authentication
    server.decorate("authenticate", async function (request: FastifyRequest, reply: FastifyReply) {
        try {
            await request.jwtVerify({ onlyCookie: true });
            request.authenticated = true;
        } catch (err) {
            void reply.send(err);
            request.authenticated = false;
        }
    });

    // Attempts to verify user but does not stop if verification fails (allows routes with optional authentication)
    server.decorate("optionalAuthenticate", async function (request: FastifyRequest) {
        try {
            await request.jwtVerify({ onlyCookie: true });
            request.authenticated = true;
        } catch (err) {
            request.authenticated = false;
        }
    });
});

export default authenticationPlugin;
