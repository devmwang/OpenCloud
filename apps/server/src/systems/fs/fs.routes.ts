/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from "fastify";

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
        preValidation: [server.optionalAuthenticate],
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
        preValidation: [server.optionalAuthenticate],
        schema: {
            params: $ref("fileParamsSchema"),
            querystring: $ref("fileReadQuerySchema"),
        },
        handler: getFileHandler,
    });

    server.route({
        method: "GET",
        url: "/files/:fileId/thumbnail",
        preValidation: [server.optionalAuthenticate],
        schema: {
            params: $ref("fileParamsSchema"),
            querystring: $ref("fileReadQuerySchema"),
        },
        handler: getThumbnailHandler,
    });

    server.route({
        method: "PATCH",
        url: "/files/:fileId",
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
