/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from "fastify";

import { uploadFileHandler } from "./upload.handlers";
import { $ref } from "./upload.schemas";

async function uploadRouter(server: FastifyInstance) {
    server.route({
        method: "POST",
        url: "/files",
        onRequest: [server.optionalAuthenticate],
        preHandler: [server.requireCsrf],
        schema: {
            querystring: $ref("uploadFileQuerySchema"),
            response: { 201: $ref("uploadFileResponseSchema") },
        },
        handler: uploadFileHandler,
    });
}

export default uploadRouter;
