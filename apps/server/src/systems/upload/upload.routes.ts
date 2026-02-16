/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from "fastify";

import { uploadFileHandler } from "./upload.handlers";
import { $ref } from "./upload.schemas";

async function uploadRouter(server: FastifyInstance) {
    server.route({
        method: "POST",
        url: "/files",
        preValidation: [server.optionalAuthenticate],
        preHandler: [
            async (request, reply) => {
                const query = request.query as { folderId?: string } | undefined;
                if (request.authenticated && typeof query?.folderId === "string" && query.folderId.length > 0) {
                    await server.requireCsrf(request, reply);
                }
            },
        ],
        schema: {
            querystring: $ref("uploadFileQuerySchema"),
            response: { 201: $ref("uploadFileResponseSchema") },
        },
        handler: uploadFileHandler,
    });
}

export default uploadRouter;
