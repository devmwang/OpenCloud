import fs from "node:fs";
import path from "node:path";

import dotenvx from "@dotenvx/dotenvx";
import { createEnv } from "@t3-oss/env-core";
import { getDomain } from "tldts";
import { z } from "zod";

const httpOriginSchema = z
    .string()
    .url()
    .transform((value, context) => {
        const url = new URL(value);
        if (
            (url.protocol !== "http:" && url.protocol !== "https:") ||
            url.username ||
            url.password ||
            url.pathname !== "/" ||
            url.search ||
            url.hash
        ) {
            context.addIssue({
                code: "custom",
                message: "Must be an HTTP(S) origin without credentials, a path, a query, or a fragment",
            });
            return z.NEVER;
        }

        return url.origin;
    });

const cookieDomainSchema = z
    .string()
    .trim()
    .min(1)
    .transform((input, context) => {
        const value = input.startsWith(".") ? input.slice(1) : input;
        let url: URL;

        try {
            url = new URL(`http://${value}`);
        } catch {
            context.addIssue({
                code: "custom",
                message: "Must be a hostname without a scheme, port, path, query, or fragment",
            });
            return z.NEVER;
        }

        if (
            !value ||
            value.endsWith(".") ||
            url.hostname !== value.toLowerCase() ||
            url.port ||
            url.pathname !== "/" ||
            url.search ||
            url.hash
        ) {
            context.addIssue({
                code: "custom",
                message: "Must be a hostname without a scheme, port, path, query, or fragment",
            });
            return z.NEVER;
        }

        return url.hostname;
    });

const authSecretSchema = z
    .string()
    .min(32, "Must be at least 32 characters")
    .refine(
        (value) => value !== "better-auth-secret-12345678901234567890",
        "Must not use the Better Auth default secret",
    )
    .refine(
        (value) => value.length * Math.log2(new Set(value).size) >= 120,
        "Must have at least 120 bits of estimated entropy",
    );

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

const parsedEnv = createEnv({
    server: {
        OPENCLOUD_WEBUI_URL: httpOriginSchema,
        NEXT_PUBLIC_OPENCLOUD_SERVER_URL: httpOriginSchema,
        COOKIE_URL: cookieDomainSchema.optional(),
        AUTH_SECRET: authSecretSchema,
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

const webUrl = new URL(parsedEnv.OPENCLOUD_WEBUI_URL);
const apiUrl = new URL(parsedEnv.NEXT_PUBLIC_OPENCLOUD_SERVER_URL);

if (webUrl.protocol !== apiUrl.protocol) {
    throw new Error("Nova and API origins must use the same protocol");
}

const isSameHostname = webUrl.hostname === apiUrl.hostname;

export type SessionCookieScope =
    | { type: "host"; protocol: string; hostname: string }
    | { type: "domain"; protocol: string; domain: string };

let sessionCookieScope: SessionCookieScope;

if (isSameHostname) {
    if (parsedEnv.COOKIE_URL && parsedEnv.COOKIE_URL !== webUrl.hostname) {
        throw new Error("COOKIE_URL must match the shared Nova and API hostname");
    }

    sessionCookieScope = {
        type: "host",
        protocol: apiUrl.protocol,
        hostname: apiUrl.hostname,
    };
} else {
    const cookieDomain = parsedEnv.COOKIE_URL;
    if (!cookieDomain) {
        throw new Error("COOKIE_URL is required when Nova and the API use different hostnames");
    }

    const isDirectSubdomain = (hostname: string) => {
        const suffix = `.${cookieDomain}`;
        const prefix = hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : "";
        return prefix.length > 0 && !prefix.includes(".");
    };

    if (
        getDomain(cookieDomain, { allowPrivateDomains: true }) === null ||
        !isDirectSubdomain(webUrl.hostname) ||
        !isDirectSubdomain(apiUrl.hostname)
    ) {
        throw new Error("COOKIE_URL must be a valid non-public-suffix parent of direct Nova and API subdomains");
    }

    sessionCookieScope = {
        type: "domain",
        protocol: apiUrl.protocol,
        domain: cookieDomain,
    };
}

export const env = parsedEnv;
export { sessionCookieScope };
