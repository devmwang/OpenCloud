/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from "fastify";

import { env } from "@/env/env";

import {
    deleteFileHandler,
    getDetailsHandler,
    getFileHandler,
    getThumbnailHandler,
    patchFileHandler,
} from "./fs.handlers";
import { $ref } from "./fs.schemas";

async function fileSystemRouter(server: FastifyInstance) {
    server.route({
        method: "GET",
        url: "/files/:fileId",
        onRequest: [server.optionalAuthenticate],
        schema: {
            params: $ref("fileParamsSchema"),
            querystring: $ref("fileReadQuerySchema"),
            response: { 200: $ref("fileDetailsResponseSchema") },
        },
        handler: getDetailsHandler,
    });

    server.route({
        method: "GET",
        url: "/files/:fileId/content",
        onRequest: [
            server.optionalAuthenticate,
            (request, _reply, done) => {
                request.raw.setTimeout(env.SERVER_CONNECTION_TIMEOUT_MS);
                done();
            },
        ],
        onResponse: [
            (request, _reply, done) => {
                request.raw.setTimeout(0);
                done();
            },
        ],
        schema: {
            params: $ref("fileParamsSchema"),
            querystring: $ref("fileReadQuerySchema"),
        },
        handler: getFileHandler,
    });

    server.route({
        method: "GET",
        url: "/files/:fileId/thumbnail",
        onRequest: [server.optionalAuthenticate],
        schema: {
            params: $ref("fileParamsSchema"),
            querystring: $ref("fileReadQuerySchema"),
        },
        handler: getThumbnailHandler,
    });

    server.route({
        method: "PATCH",
        url: "/files/:fileId",
        onRequest: [server.optionalAuthenticate],
        preValidation: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            params: $ref("fileParamsSchema"),
            body: $ref("patchFileBodySchema"),
            response: { 200: $ref("mutateFileResponseSchema") },
        },
        handler: patchFileHandler,
    });

    server.route({
        method: "DELETE",
        url: "/files/:fileId",
        onRequest: [server.optionalAuthenticate],
        preValidation: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            params: $ref("fileParamsSchema"),
            response: { 200: $ref("mutateFileResponseSchema") },
        },
        handler: deleteFileHandler,
    });
}

export default fileSystemRouter;
