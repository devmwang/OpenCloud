/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from "fastify";

import {
    deleteFileHandler,
    getDetailsHandler,
    getFileHandler,
    getThumbnailHandler,
    purgeDeletedHandler,
} from "./fs.handlers";
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
        method: "DELETE",
        url: "/delete",
        onRequest: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            querystring: $ref("deleteFileQuerySchema"),
            response: { 200: $ref("deleteFileResponseSchema") },
        },
        handler: deleteFileHandler,
    });

    server.route({
        method: "POST",
        url: "/purge-deleted",
        onRequest: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("purgeDeletedBodySchema"),
            response: { 200: $ref("purgeDeletedResponseSchema") },
        },
        handler: purgeDeletedHandler,
    });
}

export default fileSystemRouter;
