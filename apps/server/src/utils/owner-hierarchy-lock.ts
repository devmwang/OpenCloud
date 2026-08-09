import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import type { Database } from "@/db";

const OWNER_HIERARCHY_LOCK_NAMESPACE = 820_514_138;
const OWNER_HIERARCHY_BUSY_MESSAGE = "Another file operation is in progress. Try again.";

export type OwnerHierarchyTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const tryWithOwnerHierarchyLock = async <T>(
    server: FastifyInstance,
    ownerId: string,
    operation: (tx: OwnerHierarchyTransaction) => Promise<T>,
): Promise<{ locked: false; result: null } | { locked: true; result: T }> => {
    return server.db.transaction(async (tx) => {
        const lockResult = await tx.execute<{ locked: boolean }>(sql`
            select pg_try_advisory_xact_lock(${OWNER_HIERARCHY_LOCK_NAMESPACE}, hashtext(${ownerId})) as "locked"
        `);

        if (!lockResult.rows[0]!.locked) {
            return { locked: false, result: null };
        }

        return { locked: true, result: await operation(tx) };
    });
};

export const withOwnerHierarchyLock = async <T>(
    server: FastifyInstance,
    ownerId: string,
    operation: (tx: OwnerHierarchyTransaction) => Promise<T>,
): Promise<T> => {
    const lockResult = await tryWithOwnerHierarchyLock(server, ownerId, operation);
    if (lockResult.locked) {
        return lockResult.result;
    }

    throw Object.assign(new Error(OWNER_HIERARCHY_BUSY_MESSAGE), { statusCode: 409 });
};
