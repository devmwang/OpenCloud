import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import { createDatabase, type Database } from "@/db";

declare module "fastify" {
    interface FastifyInstance {
        db: Database;
    }
}

const dbPlugin: FastifyPluginAsync = fp(async (server) => {
    const { db, pool } = createDatabase();

    server.decorate("db", db);

    server.addHook("onClose", async () => {
        await pool.end();
    });
});

export default dbPlugin;
