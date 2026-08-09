import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import type { Database } from "@/db";

const OWNER_HIERARCHY_LOCK_NAMESPACE = 820_514_138;

export type OwnerHierarchyTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const withOwnerHierarchyLock = async <T>(
    server: FastifyInstance,
    ownerId: string,
    operation: (tx: OwnerHierarchyTransaction) => Promise<T>,
): Promise<T> => {
    return server.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${OWNER_HIERARCHY_LOCK_NAMESPACE}, hashtext(${ownerId}))`);
        return operation(tx);
    });
};
