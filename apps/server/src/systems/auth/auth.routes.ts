/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from "fastify";

import { createAccessRuleHandler, createUploadTokenHandler, createUserHandler, infoHandler } from "./auth.handlers";
import { $ref } from "./auth.schemas";

async function authRouter(server: FastifyInstance) {
    server.route({
        method: "POST",
        url: "/create",
        onRequest: [server.authenticate],
        schema: {
            body: $ref("createUserSchema"),
            response: { 201: $ref("userInfoResponseSchema") },
        },
        handler: createUserHandler,
    });

    server.route({
        method: "GET",
        url: "/info",
        onRequest: [server.authenticate],
        schema: {
            response: { 200: $ref("userInfoResponseSchema") },
        },
        handler: infoHandler,
    });

    server.route({
        method: "POST",
        url: "/create-access-rule",
        onRequest: [server.authenticate],
        schema: {
            body: $ref("createAccessRuleSchema"),
        },
        handler: createAccessRuleHandler,
    });

    server.route({
        method: "POST",
        url: "/create-upload-token",
        onRequest: [server.authenticate],
        schema: {
            body: $ref("createUploadTokenSchema"),
            response: { 200: $ref("createUploadTokenResponseSchema") },
        },
        handler: createUploadTokenHandler,
    });
}

export default authRouter;
