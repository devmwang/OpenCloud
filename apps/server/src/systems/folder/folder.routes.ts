/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from "fastify";

import {
    createFolderHandler,
    deleteFolderHandler,
    getDetailsHandler,
    getDisplayPreferencesHandler,
    listChildrenHandler,
    listDestinationChildrenHandler,
    patchFolderHandler,
    putDisplayPreferencesHandler,
} from "./folder.handlers";
import { $ref } from "./folder.schemas";

async function folderRouter(server: FastifyInstance) {
    server.route({
        method: "GET",
        url: "/folders/:folderId",
        onRequest: [server.optionalAuthenticate],
        preValidation: [server.authenticate],
        schema: {
            params: $ref("folderParamsSchema"),
            response: { 200: $ref("getFolderDetailsResponseSchema") },
        },
        handler: getDetailsHandler,
    });

    server.route({
        method: "GET",
        url: "/folders/:folderId/children",
        onRequest: [server.optionalAuthenticate],
        preValidation: [server.authenticate],
        schema: {
            params: $ref("folderParamsSchema"),
            querystring: $ref("getFolderChildrenQuerySchema"),
            response: { 200: $ref("getFolderChildrenResponseSchema") },
        },
        handler: listChildrenHandler,
    });

    server.route({
        method: "GET",
        url: "/folders/:folderId/destination-children",
        onRequest: [server.optionalAuthenticate],
        preValidation: [server.authenticate],
        schema: {
            params: $ref("folderParamsSchema"),
            response: { 200: $ref("getFolderDestinationChildrenResponseSchema") },
        },
        handler: listDestinationChildrenHandler,
    });

    server.route({
        method: "POST",
        url: "/folders",
        onRequest: [server.optionalAuthenticate],
        preValidation: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("createFolderSchema"),
            response: { 201: $ref("createFolderResponseSchema") },
        },
        handler: createFolderHandler,
    });

    server.route({
        method: "PATCH",
        url: "/folders/:folderId",
        onRequest: [server.optionalAuthenticate],
        preValidation: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            params: $ref("folderParamsSchema"),
            body: $ref("patchFolderBodySchema"),
            response: { 200: $ref("mutateFolderResponseSchema") },
        },
        handler: patchFolderHandler,
    });

    server.route({
        method: "DELETE",
        url: "/folders/:folderId",
        onRequest: [server.optionalAuthenticate],
        preValidation: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            params: $ref("folderParamsSchema"),
            response: { 200: $ref("mutateFolderResponseSchema") },
        },
        handler: deleteFolderHandler,
    });

    server.route({
        method: "GET",
        url: "/folders/:folderId/display-preferences",
        onRequest: [server.optionalAuthenticate],
        preValidation: [server.authenticate],
        schema: {
            params: $ref("folderParamsSchema"),
            response: { 200: $ref("displayPreferencesResponseSchema") },
        },
        handler: getDisplayPreferencesHandler,
    });

    server.route({
        method: "PUT",
        url: "/folders/:folderId/display-preferences",
        onRequest: [server.optionalAuthenticate],
        preValidation: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            params: $ref("folderParamsSchema"),
            body: $ref("putDisplayPreferencesSchema"),
            response: { 200: $ref("displayPreferencesResponseSchema") },
        },
        handler: putDisplayPreferencesHandler,
    });
}

export default folderRouter;
