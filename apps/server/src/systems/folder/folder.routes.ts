/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from "fastify";

import {
    createFolderHandler,
    getContentsHandler,
    getDetailsHandler,
    getDisplayOrderHandler,
    moveFolderHandler,
    setDisplayOrderHandler,
} from "./folder.handlers";
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
        method: "POST",
        url: "/move-folder",
        onRequest: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("moveFolderBodySchema"),
            response: { 200: $ref("moveFolderResponseSchema") },
        },
        handler: moveFolderHandler,
    });

    server.route({
        method: "GET",
        url: "/get-display-order",
        onRequest: [server.authenticate],
        schema: {
            querystring: $ref("getDisplayOrderQuerySchema"),
            response: { 200: $ref("displayOrderResponseSchema") },
        },
        handler: getDisplayOrderHandler,
    });

    server.route({
        method: "POST",
        url: "/set-display-order",
        onRequest: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("setDisplayOrderSchema"),
            response: { 200: $ref("displayOrderResponseSchema") },
        },
        handler: setDisplayOrderHandler,
    });
}

export default folderRouter;
