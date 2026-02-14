/* eslint-disable turbo/no-undeclared-env-vars */
// Baseline helper for Drizzle migrations.
// Usage (dry run): pnpm --filter server db:baseline -- --tag 0000_initial
// Apply: pnpm --filter server db:baseline -- --apply --tag 0000_initial
// Notes: Reads .env.local/.env for DATABASE_URL, hashes the tagged migration,
// and inserts it into public.__drizzle_migrations (use --force to override).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenvx from "@dotenvx/dotenvx";
import { Pool } from "pg";

type JournalEntry = {
    idx: number;
    when: number;
    tag: string;
    breakpoints: boolean;
};

const findEnvFile = (fileName: string, startDir: string) => {
    let currentDir = startDir;

    while (true) {
        const candidate = path.join(currentDir, fileName);
        try {
            if (fs.statSync(candidate).isFile()) {
                return candidate;
            }
        } catch {}

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            return null;
        }

        currentDir = parentDir;
    }
};

const getArgValue = (flag: string) => {
    const index = process.argv.indexOf(flag);
    if (index === -1) return undefined;
    return process.argv[index + 1];
};

const readTextFileOrThrow = (filePath: string, missingErrorMessage: string) => {
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            throw new Error(missingErrorMessage);
        }

        throw error;
    }
};

const run = async () => {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const serverRoot = path.resolve(scriptDir, "..", "..");
    const migrationsDir = path.join(serverRoot, "src", "db", "migrations");
    const journalPath = path.join(migrationsDir, "meta", "_journal.json");

    const envPaths = [findEnvFile(".env.local", serverRoot), findEnvFile(".env", serverRoot)].filter(
        (value): value is string => Boolean(value),
    );

    if (envPaths.length > 0) {
        dotenvx.config({
            path: envPaths,
            ignore: ["MISSING_ENV_FILE"],
            quiet: true,
        });
    }

    const databaseUrl = process.env["DATABASE_URL"];
    if (!databaseUrl) {
        throw new Error("DATABASE_URL is not set.");
    }

    const journalRaw = readTextFileOrThrow(journalPath, `Missing migrations journal at ${journalPath}`);
    const journal = JSON.parse(journalRaw) as { entries: JournalEntry[] };

    const targetTag = getArgValue("--tag") ?? "0000_initial";
    const apply = process.argv.includes("--apply");
    const force = process.argv.includes("--force");

    const entry = journal.entries.find((item) => item.tag === targetTag);
    if (!entry) {
        throw new Error(`Migration tag "${targetTag}" not found in ${journalPath}`);
    }

    const migrationPath = path.join(migrationsDir, `${entry.tag}.sql`);
    const migrationSql = readTextFileOrThrow(migrationPath, `Missing migration file at ${migrationPath}`);
    const hash = crypto.createHash("sha256").update(migrationSql).digest("hex");

    console.log(`Baseline target: ${entry.tag}`);
    console.log(`created_at: ${entry.when}`);
    console.log(`hash: ${hash}`);

    if (!apply) {
        console.log("Dry run (pass --apply to write to __drizzle_migrations).");
        return;
    }

    const pool = new Pool({ connectionString: databaseUrl });
    const client = await pool.connect();

    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS "public"."__drizzle_migrations" (
                id SERIAL PRIMARY KEY,
                hash text NOT NULL,
                created_at numeric
            );
        `);

        const existing = await client.query(
            `SELECT id, hash, created_at FROM "public"."__drizzle_migrations" ORDER BY created_at DESC`,
        );

        if (existing.rowCount && !force) {
            throw new Error(`__drizzle_migrations already has entries. Use --force to insert anyway.`);
        }

        const alreadyInserted = await client.query(
            `SELECT 1 FROM "public"."__drizzle_migrations" WHERE created_at = $1 LIMIT 1`,
            [entry.when],
        );

        if (alreadyInserted.rowCount) {
            console.log("Baseline already present. Skipping insert.");
            return;
        }

        await client.query(`INSERT INTO "public"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)`, [
            hash,
            entry.when,
        ]);

        console.log("Baseline inserted into __drizzle_migrations.");
    } finally {
        client.release();
        await pool.end();
    }
};

void run().catch((error) => {
    console.error(error);
    process.exit(1);
});
