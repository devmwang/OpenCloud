import FastifyCsrfProtection from "@fastify/csrf-protection";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import { env } from "@/env/env";

declare module "fastify" {
    interface FastifyInstance {
        requireCsrf(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    }
}

const csrfPlugin: FastifyPluginAsync = fp(async (server) => {
    const isSecureCookie = env.COOKIE_URL.startsWith("https://");
    const cookieKey = isSecureCookie ? "__Host-opencloud-csrf" : "opencloud-csrf";

    await server.register(FastifyCsrfProtection, {
        cookieKey,
        cookieOpts: {
            httpOnly: true,
            path: "/",
            sameSite: "strict",
            secure: isSecureCookie,
            signed: true,
        },
    });

    server.decorate("requireCsrf", async (request, reply) => {
        if (!request.authenticated) {
            return;
        }

        const isValid = await new Promise<boolean>((resolve, reject) => {
            try {
                server.csrfProtection(request, reply, (error?: Error) => {
                    if (error) {
                        reject(error instanceof Error ? error : new Error("CSRF validation failed"));
                    } else {
                        resolve(true);
                    }
                });
            } catch (error) {
                reject(error instanceof Error ? error : new Error("CSRF validation failed"));
            }
        }).catch(() => false);

        if (!isValid) {
            if (!reply.sent) {
                reply.code(403).send({ error: "Forbidden", message: "Invalid CSRF token" });
            }
            return;
        }
    });
});

export default csrfPlugin;
