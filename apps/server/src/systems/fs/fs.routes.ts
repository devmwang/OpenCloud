/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from "fastify";

import { getDetailsHandler, getFileHandler, getThumbnailHandler, moveFileHandler } from "./fs.handlers";
import { $ref } from "./fs.schemas";

async function fileSystemRouter(server: FastifyInstance) {
    server.route({
        method: "GET",
        url: "/get-details",
        onRequest: [server.optionalAuthenticate],
        schema: {
            querystring: $ref("getDetailsQuerySchema"),
            response: { 200: $ref("getDetailsResponseSchema") },
        },
        handler: getDetailsHandler,
    });

    server.route({
        method: "GET",
        url: "/get/:fileId",
        onRequest: [server.optionalAuthenticate],
        schema: {
            params: $ref("getFileParamsSchema"),
            querystring: $ref("getFileQuerySchema"),
        },
        handler: getFileHandler,
    });

    server.route({
        method: "GET",
        url: "/get-thumbnail/:fileId",
        onRequest: [server.optionalAuthenticate],
        schema: {
            params: $ref("getThumbnailParamsSchema"),
            querystring: $ref("getThumbnailQuerySchema"),
        },
        handler: getThumbnailHandler,
    });

    server.route({
        method: "POST",
        url: "/move",
        onRequest: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("moveFileBodySchema"),
            response: { 200: $ref("moveFileResponseSchema") },
        },
        handler: moveFileHandler,
    });
}

export default fileSystemRouter;
