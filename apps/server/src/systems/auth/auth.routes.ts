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
    updateAccessRuleHandler,
    updateUploadTokenHandler,
} from "./auth.handlers";
import { $ref } from "./auth.schemas";

async function authRouter(server: FastifyInstance) {
    server.route({
        method: "POST",
        url: "/users",
        preValidation: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("createUserSchema"),
            response: { 201: $ref("userInfoResponseSchema") },
        },
        handler: createUserHandler,
    });

    server.route({
        method: "GET",
        url: "/users/me",
        preValidation: [server.authenticate],
        schema: {
            response: { 200: $ref("userInfoResponseSchema") },
        },
        handler: infoHandler,
    });

    server.route({
        method: "GET",
        url: "/csrf-token",
        preValidation: [server.authenticate],
        schema: {
            response: { 200: $ref("csrfTokenResponseSchema") },
        },
        handler: csrfTokenHandler,
    });

    server.route({
        method: "GET",
        url: "/access-rules",
        preValidation: [server.authenticate],
        schema: {
            response: { 200: $ref("listAccessRulesResponseSchema") },
        },
        handler: listAccessRulesHandler,
    });

    server.route({
        method: "POST",
        url: "/access-rules",
        preValidation: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("createAccessRuleSchema"),
            response: { 200: $ref("statusMessageResponseSchema") },
        },
        handler: createAccessRuleHandler,
    });

    server.route({
        method: "PATCH",
        url: "/access-rules/:ruleId",
        preValidation: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            params: $ref("accessRuleParamsSchema"),
            body: $ref("updateAccessRuleSchema"),
            response: { 200: $ref("statusMessageResponseSchema") },
        },
        handler: updateAccessRuleHandler,
    });

    server.route({
        method: "GET",
        url: "/upload-tokens",
        preValidation: [server.authenticate],
        schema: {
            response: { 200: $ref("listUploadTokensResponseSchema") },
        },
        handler: listUploadTokensHandler,
    });

    server.route({
        method: "POST",
        url: "/upload-tokens",
        preValidation: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("createUploadTokenSchema"),
            response: { 200: $ref("createUploadTokenResponseSchema") },
        },
        handler: createUploadTokenHandler,
    });

    server.route({
        method: "PATCH",
        url: "/upload-tokens/:tokenId",
        preValidation: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            params: $ref("uploadTokenParamsSchema"),
            body: $ref("updateUploadTokenSchema"),
            response: { 200: $ref("statusMessageResponseSchema") },
        },
        handler: updateUploadTokenHandler,
    });

    server.route({
        method: "POST",
        url: "/files/:fileId/read-tokens",
        preValidation: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            params: $ref("createReadTokenParamsSchema"),
            body: $ref("createReadTokenSchema"),
            response: { 200: $ref("createReadTokenResponseSchema") },
        },
        handler: createReadTokenHandler,
    });
}

export default authRouter;
