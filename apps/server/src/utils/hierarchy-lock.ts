import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { PoolClient } from "pg";

import { createPostgresPool } from "@/db";
import { env } from "@/env/env";

const HIERARCHY_LOCK_NAMESPACE = 820_514_138;

type HierarchyLockMode = "exclusive" | "shared";

class HierarchyBusyError extends Error {
    readonly statusCode = 409;

    constructor() {
        super("Another folder operation is already in progress");
        this.name = "HierarchyBusyError";
    }
}

declare module "fastify" {
    interface FastifyRequest {
        hierarchyLockClient: PoolClient | null;
        hierarchyLockOwnerId: string | null;
    }

    interface FastifyInstance {
        acquireOwnerHierarchyLock: (request: FastifyRequest) => Promise<void>;
        releaseOwnerHierarchyLock: (request: FastifyRequest) => Promise<void>;
        tryWithOwnerHierarchyLock: <T>(
            ownerId: string,
            operation: () => Promise<T>,
        ) => Promise<{ locked: true; result: T } | { locked: false; result: null }>;
        tryWithOwnerHierarchySharedLock: <T>(
            ownerId: string,
            operation: () => Promise<T>,
        ) => Promise<{ locked: true; result: T } | { locked: false; result: null }>;
    }
}

const hierarchyLockPlugin: FastifyPluginAsync = fp(async (server) => {
    const lockPool = createPostgresPool({
        max: env.HIERARCHY_LOCK_POOL_MAX,
        onPoolError: (error) => {
            server.log.error({ err: error }, "Postgres hierarchy-lock pool client error");
        },
    });

    server.decorateRequest("hierarchyLockClient", null);
    server.decorateRequest("hierarchyLockOwnerId", null);

    const tryAcquireOwnerHierarchyLock = async (ownerId: string, mode: HierarchyLockMode) => {
        if (lockPool.idleCount === 0 && lockPool.totalCount >= env.HIERARCHY_LOCK_POOL_MAX) {
            return null;
        }

        const client = await lockPool.connect();
        try {
            const lockFunction = mode === "shared" ? "pg_try_advisory_lock_shared" : "pg_try_advisory_lock";
            const result = await client.query<{ locked: boolean }>(
                `select ${lockFunction}(hashtextextended($1, $2)) as locked`,
                [ownerId, HIERARCHY_LOCK_NAMESPACE],
            );
            if (!result.rows[0]?.locked) {
                client.release();
                return null;
            }
            return client;
        } catch (error) {
            client.release(error instanceof Error ? error : new Error("Hierarchy lock acquisition failed"));
            throw error;
        }
    };

    const releaseOwnerHierarchyLock = async (client: PoolClient, ownerId: string, mode: HierarchyLockMode) => {
        try {
            const unlockFunction = mode === "shared" ? "pg_advisory_unlock_shared" : "pg_advisory_unlock";
            await client.query(`select ${unlockFunction}(hashtextextended($1, $2))`, [
                ownerId,
                HIERARCHY_LOCK_NAMESPACE,
            ]);
            client.release();
        } catch (error) {
            client.release(error instanceof Error ? error : new Error("Hierarchy lock release failed"));
            throw error;
        }
    };

    const tryWithOwnerHierarchyLock = async <T>(
        ownerId: string,
        mode: HierarchyLockMode,
        operation: () => Promise<T>,
    ) => {
        const client = await tryAcquireOwnerHierarchyLock(ownerId, mode);
        if (!client) {
            return { locked: false, result: null } as const;
        }

        try {
            return { locked: true, result: await operation() } as const;
        } finally {
            await releaseOwnerHierarchyLock(client, ownerId, mode);
        }
    };

    server.decorate("acquireOwnerHierarchyLock", async (request: FastifyRequest) => {
        const userId = request.user?.id;
        if (!userId) {
            throw new Error("Authenticated user is required for a hierarchy lock");
        }

        const client = await tryAcquireOwnerHierarchyLock(userId, "exclusive");
        if (!client) {
            throw new HierarchyBusyError();
        }
        request.hierarchyLockClient = client;
        request.hierarchyLockOwnerId = userId;
    });

    server.decorate("releaseOwnerHierarchyLock", async (request: FastifyRequest) => {
        const client = request.hierarchyLockClient;
        const ownerId = request.hierarchyLockOwnerId;
        if (!client || !ownerId) {
            return;
        }

        request.hierarchyLockClient = null;
        request.hierarchyLockOwnerId = null;
        await releaseOwnerHierarchyLock(client, ownerId, "exclusive");
    });

    server.decorate("tryWithOwnerHierarchyLock", <T>(ownerId: string, operation: () => Promise<T>) =>
        tryWithOwnerHierarchyLock(ownerId, "exclusive", operation),
    );
    server.decorate("tryWithOwnerHierarchySharedLock", <T>(ownerId: string, operation: () => Promise<T>) =>
        tryWithOwnerHierarchyLock(ownerId, "shared", operation),
    );

    server.addHook("onClose", async () => {
        await lockPool.end();
    });
});

export default hierarchyLockPlugin;
