import fs from "node:fs";
import path from "node:path";

import dotenvx from "@dotenvx/dotenvx";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const httpOriginSchema = z
    .string()
    .url()
    .transform((value, context) => {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol)) {
            context.addIssue({ code: "custom", message: "URL must use http or https" });
            return z.NEVER;
        }
        if (url.username || url.password) {
            context.addIssue({ code: "custom", message: "URL must not contain credentials" });
            return z.NEVER;
        }
        return url.origin;
    });

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
        OPENCLOUD_WEBUI_URL: httpOriginSchema,
        NEXT_PUBLIC_OPENCLOUD_SERVER_URL: httpOriginSchema,
        COOKIE_URL: z.string().trim().min(1),
        AUTH_SECRET: z
            .string()
            .min(32)
            .refine((value) => value !== "CHANGE ME", {
                message: "AUTH_SECRET must be a unique, high-entropy secret",
            }),
        DATABASE_URL: z.string().url(),
        DATABASE_POOL_MAX: z.coerce.number().int().min(2).default(10),
        HIERARCHY_LOCK_POOL_MAX: z.coerce.number().int().min(1).default(10),
        FILE_STORE_PATH: z.string().trim().min(1),
        SERVER_HOST: z.string().default("0.0.0.0"),
        SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
        TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
        CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(120_000),
        REQUEST_TIMEOUT_MS: z.coerce
            .number()
            .int()
            .min(1_000)
            .default(30 * 60 * 1000),
        MAX_UPLOAD_SIZE_BYTES: z.coerce
            .number()
            .int()
            .min(1)
            .max(10 * 1024 * 1024 * 1024)
            .default(1024 * 1024 * 1024),
        FILE_PURGE_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
        RATE_LIMIT_AUTH_MAX_PER_MINUTE: z.coerce.number().int().min(1).default(240),
        RATE_LIMIT_ASSET_READ_MAX_PER_MINUTE: z.coerce.number().int().min(1).default(120),
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
