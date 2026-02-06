/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from "fastify";

import {
    createAccessRuleHandler,
    createReadTokenHandler,
    createUploadTokenHandler,
    createUserHandler,
    csrfTokenHandler,
    infoHandler,
    listAccessRulesHandler,
    listUploadTokensHandler,
} from "./auth.handlers";
import { $ref } from "./auth.schemas";

async function authRouter(server: FastifyInstance) {
    server.route({
        method: "POST",
        url: "/create",
        onRequest: [server.authenticate],
        preHandler: [server.requireCsrf],
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
        method: "GET",
        url: "/csrf",
        onRequest: [server.authenticate],
        schema: {
            response: {
                200: $ref("csrfTokenResponseSchema"),
            },
        },
        handler: csrfTokenHandler,
    });

    server.route({
        method: "GET",
        url: "/access-rules",
        onRequest: [server.authenticate],
        schema: {
            response: { 200: $ref("listAccessRulesResponseSchema") },
        },
        handler: listAccessRulesHandler,
    });

    server.route({
        method: "GET",
        url: "/upload-tokens",
        onRequest: [server.authenticate],
        schema: {
            response: { 200: $ref("listUploadTokensResponseSchema") },
        },
        handler: listUploadTokensHandler,
    });

    server.route({
        method: "POST",
        url: "/create-access-rule",
        onRequest: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("createAccessRuleSchema"),
        },
        handler: createAccessRuleHandler,
    });

    server.route({
        method: "POST",
        url: "/create-upload-token",
        onRequest: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("createUploadTokenSchema"),
            response: { 200: $ref("createUploadTokenResponseSchema") },
        },
        handler: createUploadTokenHandler,
    });

    server.route({
        method: "POST",
        url: "/create-read-token",
        onRequest: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("createReadTokenSchema"),
            response: { 200: $ref("createReadTokenResponseSchema") },
        },
        handler: createReadTokenHandler,
    });
}

export default authRouter;
