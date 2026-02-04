/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from "fastify";

import { tokenUploadHandler, uploadHandler } from "./upload.handlers";
import { $ref } from "./upload.schemas";

async function uploadRouter(server: FastifyInstance) {
    server.route({
        method: "POST",
        url: "/single",
        onRequest: [server.authenticate],
        schema: {
            querystring: $ref("uploadFileQuerySchema"),
            response: { 201: $ref("uploadFileResponseSchema") },
        },
        handler: uploadHandler,
    });

    server.route({
        method: "POST",
        url: "/token-single",
        schema: {
            response: { 201: $ref("uploadFileResponseSchema") },
        },
        handler: tokenUploadHandler,
    });
}

export default uploadRouter;
