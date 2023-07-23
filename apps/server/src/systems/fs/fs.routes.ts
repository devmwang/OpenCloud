/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from "fastify";

import { $ref } from "./fs.schemas";
import { getFileHandler, getThumbnailHandler, deleteFileHandler } from "./fs.handlers";

async function fileSystemRouter(server: FastifyInstance) {
    server.route({
        method: "GET",
        url: "/get/:fileId",
        onRequest: [server.optionalAuthenticate],
        schema: {
            params: $ref("getFileParamsSchema"),
        },
        handler: getFileHandler,
    });

    server.route({
        method: "GET",
        url: "/get-thumbnail/:fileId",
        onRequest: [server.optionalAuthenticate],
        schema: {
            params: $ref("getThumbnailParamsSchema"),
        },
        handler: getThumbnailHandler,
    });

    server.route({
        method: "DELETE",
        url: "/delete",
        onRequest: [server.authenticate],
        schema: {
            querystring: $ref("deleteFileQuerySchema"),
            response: { 200: $ref("deleteFileResponseSchema") },
        },
        handler: deleteFileHandler,
    });
}

export default fileSystemRouter;
