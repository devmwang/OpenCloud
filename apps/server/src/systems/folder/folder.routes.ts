/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from "fastify";

import { createFolderHandler, deleteFolderHandler, getContentsHandler, getDetailsHandler } from "./folder.handlers";
import { $ref } from "./folder.schemas";

async function folderRouter(server: FastifyInstance) {
    server.route({
        method: "GET",
        url: "/get-details",
        onRequest: [server.authenticate],
        schema: {
            querystring: $ref("getDetailsQuerySchema"),
            response: { 200: $ref("getDetailsResponseSchema") },
        },
        handler: getDetailsHandler,
    });

    server.route({
        method: "GET",
        url: "/get-contents",
        onRequest: [server.authenticate],
        schema: {
            querystring: $ref("getContentsQuerySchema"),
            response: { 200: $ref("getContentsResponseSchema") },
        },
        handler: getContentsHandler,
    });

    server.route({
        method: "POST",
        url: "/create-folder",
        onRequest: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("createFolderSchema"),
            response: { 201: $ref("createFolderResponseSchema") },
        },
        handler: createFolderHandler,
    });

    server.route({
        method: "DELETE",
        url: "/delete-folder",
        onRequest: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            querystring: $ref("deleteFolderQuerySchema"),
            response: { 200: $ref("deleteFolderResponseSchema") },
        },
        handler: deleteFolderHandler,
    });
}

export default folderRouter;
