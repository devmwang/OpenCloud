import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/env/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export const createDatabase = () => {
    const pool = new Pool({ connectionString: env.DATABASE_URL });
    const db = drizzle(pool, { schema });

    return { db, pool };
};
