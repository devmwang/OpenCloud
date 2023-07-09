/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from "fastify";

import { $ref } from "./fs.schemas";
import { uploadHandler, tokenUploadHandler, getFileHandler, deleteFileHandler } from "./fs.handlers";

async function fileSystemRouter(server: FastifyInstance) {
    server.route({
        method: "POST",
        url: "/upload",
        onRequest: [server.authenticate],
        schema: {
            querystring: $ref("uploadFileQuerySchema"),
            response: { 201: $ref("uploadFileResponseSchema") },
        },
        handler: uploadHandler,
    });

    server.route({
        method: "POST",
        url: "/token-upload",
        schema: {
            response: { 201: $ref("uploadFileResponseSchema") },
        },
        handler: tokenUploadHandler,
    });

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
