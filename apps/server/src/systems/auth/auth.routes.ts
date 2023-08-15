/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from "fastify";

import { $ref } from "./auth.schemas";
import {
    createUserHandler,
    loginHandler,
    refreshHandler,
    infoHandler,
    createUploadTokenHandler,
    createAccessRuleHandler,
} from "./auth.handlers";

async function authRouter(server: FastifyInstance) {
    server.route({
        method: "POST",
        url: "/create",
        schema: {
            body: $ref("createUserSchema"),
            response: { 201: $ref("userInfoResponseSchema") },
        },
        handler: createUserHandler,
    });

    server.route({
        method: "POST",
        url: "/login",
        schema: {
            body: $ref("loginSchema"),
            response: { 200: $ref("loginResponseSchema") },
        },
        handler: loginHandler,
    });

    server.route({
        method: "POST",
        url: "/refresh",
        schema: {
            body: $ref("refreshSchema"),
        },
        handler: refreshHandler,
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
