import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import { createDatabase, type Database } from "@/db";
import { env } from "@/env/env";

declare module "fastify" {
    interface FastifyInstance {
        db: Database;
    }
}

const dbPlugin: FastifyPluginAsync = fp(async (server) => {
    const { db, pool } = createDatabase({
        max: env.DATABASE_POOL_MAX,
        onPoolError: (error) => {
            server.log.error({ err: error }, "Postgres pool client error");
        },
    });

    server.decorate("db", db);

    server.addHook("onClose", async () => {
        await pool.end();
    });
});

export default dbPlugin;
