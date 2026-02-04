import fs from "node:fs";
import path from "node:path";

import dotenvx from "@dotenvx/dotenvx";
import { defineConfig } from "drizzle-kit";

import { env } from "@/env/env";

const findEnvFile = (fileName: string) => {
    let currentDir = process.cwd();

    while (true) {
        const candidate = path.join(currentDir, fileName);
        if (fs.existsSync(candidate)) {
            return candidate;
        }

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            return null;
        }

        currentDir = parentDir;
    }
};

const envPaths = [findEnvFile(".env.local"), findEnvFile(".env")].filter((value): value is string => Boolean(value));

if (envPaths.length > 0) {
    dotenvx.config({
        path: envPaths,
        ignore: ["MISSING_ENV_FILE"],
        quiet: true,
    });
}

export default defineConfig({
    schema: "./src/db/schema/index.ts",
    out: "./src/db/migrations",
    dialect: "postgresql",
    migrations: {
        schema: "public",
    },
    dbCredentials: {
        url: env.DATABASE_URL,
    },
});
