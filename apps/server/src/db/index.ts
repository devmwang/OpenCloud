import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/env/env";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

type CreatePostgresPoolOptions = {
    max?: number;
    onPoolError?: (error: Error) => void;
};

export const createPostgresPool = (options: CreatePostgresPoolOptions = {}) => {
    const pool = new Pool({
        connectionString: env.DATABASE_URL,
        // Remote development databases can silently drop idle sockets.
        // Keepalive + explicit timeouts reduce stale connections and hangs.
        keepAlive: true,
        keepAliveInitialDelayMillis: 10_000,
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 30_000,
        ...(options.max === undefined ? {} : { max: options.max }),
    });

    pool.on("error", (error: Error) => {
        if (options.onPoolError) {
            options.onPoolError(error);
            return;
        }

        // Fall back to stderr for non-Fastify callers (scripts/tests).
        console.error("[db] Unhandled pool error", error);
    });

    return pool;
};

export const createDatabase = (options: CreatePostgresPoolOptions = {}) => {
    const pool = createPostgresPool(options);

    const db = drizzle(pool, { schema });

    return { db, pool };
};
