/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from "fastify";

import {
    destinationFoldersHandler,
    emptyRecycleBinHandler,
    listRecycleBinHandler,
    moveToBinHandler,
    permanentlyDeleteHandler,
    purgeExpiredHandler,
    recycleBinScheduler,
    restoreHandler,
    runPurgeExpired,
} from "./recycle-bin.handlers";
import { $ref } from "./recycle-bin.schemas";

async function recycleBinRouter(server: FastifyInstance) {
    server.route({
        method: "POST",
        url: "/move-to-bin",
        onRequest: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("moveToBinBodySchema"),
            response: { 200: $ref("moveToBinResponseSchema") },
        },
        handler: moveToBinHandler,
    });

    server.route({
        method: "GET",
        url: "/list",
        onRequest: [server.authenticate],
        schema: {
            querystring: $ref("listQuerySchema"),
            response: { 200: $ref("listResponseSchema") },
        },
        handler: listRecycleBinHandler,
    });

    server.route({
        method: "GET",
        url: "/destination-folders",
        onRequest: [server.authenticate],
        schema: {
            querystring: $ref("destinationFoldersQuerySchema"),
            response: { 200: $ref("destinationFoldersResponseSchema") },
        },
        handler: destinationFoldersHandler,
    });

    server.route({
        method: "POST",
        url: "/restore",
        onRequest: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("restoreBodySchema"),
            response: { 200: $ref("restoreResponseSchema") },
        },
        handler: restoreHandler,
    });

    server.route({
        method: "POST",
        url: "/permanently-delete",
        onRequest: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("permanentlyDeleteBodySchema"),
            response: { 200: $ref("permanentlyDeleteResponseSchema") },
        },
        handler: permanentlyDeleteHandler,
    });

    server.route({
        method: "POST",
        url: "/empty",
        onRequest: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("emptyBodySchema"),
            response: { 200: $ref("emptyResponseSchema") },
        },
        handler: emptyRecycleBinHandler,
    });

    server.route({
        method: "POST",
        url: "/purge-expired",
        onRequest: [server.authenticate],
        preHandler: [server.requireCsrf],
        schema: {
            body: $ref("purgeExpiredBodySchema"),
            response: { 200: $ref("purgeExpiredResponseSchema") },
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
