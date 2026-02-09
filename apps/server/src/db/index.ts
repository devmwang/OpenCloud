import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/env/env";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

type CreateDatabaseOptions = {
    onPoolError?: (error: Error) => void;
};

export const createDatabase = (options: CreateDatabaseOptions = {}) => {
    const pool = new Pool({
        connectionString: env.DATABASE_URL,
        // Remote development databases can silently drop idle sockets.
        // Keepalive + explicit timeouts reduce stale connections and hangs.
        keepAlive: true,
        keepAliveInitialDelayMillis: 10_000,
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 30_000,
    });

    pool.on("error", (error: Error) => {
        if (options.onPoolError) {
            options.onPoolError(error);
            return;
        }

        // Fall back to stderr for non-Fastify callers (scripts/tests).
        console.error("[db] Unhandled pool error", error);
    });

    const db = drizzle(pool, { schema });

    return { db, pool };
};
