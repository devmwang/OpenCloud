import fs from "node:fs";
import path from "node:path";

import dotenvx from "@dotenvx/dotenvx";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const findEnvFile = (fileName: string) => {
    let currentDir = process.cwd();

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

const envPaths = [findEnvFile(".env.local"), findEnvFile(".env")].filter((value): value is string => Boolean(value));

if (envPaths.length > 0) {
    dotenvx.config({
        path: envPaths,
        ignore: ["MISSING_ENV_FILE"],
        quiet: true,
    });
}

export const env = createEnv({
    server: {
        OPENCLOUD_WEBUI_URL: z.string(),
        NEXT_PUBLIC_OPENCLOUD_SERVER_URL: z.string().url(),
        COOKIE_URL: z.string(),
        AUTH_SECRET: z.string(),
        DATABASE_URL: z.string().url(),
        FILE_STORE_PATH: z.string(),
        SERVER_HOST: z.string().default("0.0.0.0"),
        SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
        TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
        FILE_PURGE_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
        RATE_LIMIT_AUTH_MAX_PER_MINUTE: z.coerce.number().int().min(1).default(240),
        RATE_LIMIT_ASSET_READ_MAX_PER_MINUTE: z.coerce.number().int().min(1).default(6000),
        RATE_LIMIT_READ_MAX_PER_MINUTE: z.coerce.number().int().min(1).default(3000),
        RATE_LIMIT_MUTATION_MAX_PER_MINUTE: z.coerce.number().int().min(1).default(600),
    },

    /**
     * What object holds the environment variables at runtime.
     * Often `process.env` or `import.meta.env`
     */
    runtimeEnv: process.env,

    emptyStringAsUndefined: true,
});
