/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from "fastify";

import {
    destinationFoldersHandler,
    emptyRecycleBinHandler,
    listRecycleBinHandler,
    permanentlyDeleteHandler,
    purgeExpiredHandler,
    recycleBinScheduler,
    restoreHandler,
    runPurgeExpired,
} from "./recycle-bin.handlers";
import { $ref } from "./recycle-bin.schemas";

async function recycleBinRouter(server: FastifyInstance) {
    server.route({
        method: "GET",
        url: "/items",
        onRequest: [server.optionalAuthenticate],
        preValidation: [server.authenticate],
        schema: {
            querystring: $ref("listQuerySchema"),
            response: { 200: $ref("listResponseSchema") },
        },
        handler: listRecycleBinHandler,
    });

    server.route({
        method: "GET",
        url: "/destination-folders",
        onRequest: [server.optionalAuthenticate],
        preValidation: [server.authenticate],
        schema: {
            querystring: $ref("destinationFoldersQuerySchema"),
            response: { 200: $ref("destinationFoldersResponseSchema") },
        },
        handler: destinationFoldersHandler,
    });

    server.route({
        method: "POST",
        url: "/items/:itemType/:itemId/restore",
        onRequest: [server.optionalAuthenticate],
        preValidation: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            params: $ref("itemParamsSchema"),
            body: $ref("restoreBodySchema"),
            response: { 200: $ref("restoreResponseSchema") },
        },
        handler: restoreHandler,
    });

    server.route({
        method: "DELETE",
        url: "/items/:itemType/:itemId",
        onRequest: [server.optionalAuthenticate],
        preValidation: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            params: $ref("itemParamsSchema"),
            response: { 200: $ref("permanentlyDeleteResponseSchema") },
        },
        handler: permanentlyDeleteHandler,
    });

    server.route({
        method: "DELETE",
        url: "/items",
        onRequest: [server.optionalAuthenticate],
        preValidation: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            querystring: $ref("emptyQuerySchema"),
            response: { 200: $ref("emptyResponseSchema") },
        },
        handler: emptyRecycleBinHandler,
    });

    server.route({
        method: "POST",
        url: "/purge",
        onRequest: [server.optionalAuthenticate],
        preValidation: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("purgeBodySchema"),
            response: { 200: $ref("purgeResponseSchema") },
        },
        handler: purgeExpiredHandler,
    });

    const interval = setInterval(() => {
        void runPurgeExpired(server)
            .then((result) => {
                if (result.skipped || (result.purgedFiles === 0 && result.purgedFolders === 0)) {
                    return;
                }

                server.log.info(
                    {
                        purgedFiles: result.purgedFiles,
                        purgedFolders: result.purgedFolders,
                        olderThanDays: result.olderThanDays,
                    },
                    "Automatic recycle-bin purge completed",
                );
            })
            .catch((error) => {
                server.log.error({ err: error }, "Automatic recycle-bin purge failed");
            });
    }, recycleBinScheduler.intervalMs);

    server.addHook("onClose", async () => {
        clearInterval(interval);
    });
}

export default recycleBinRouter;
