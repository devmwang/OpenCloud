import * as argon2 from "argon2";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";

import type { Database } from "@/db";
import { accounts, sessions, users, verifications } from "@/db/schema";
import { crossSubDomainCookiesEnabled, env } from "@/env/env";

const usernamePlugin = username({
    usernameNormalization: false,
    usernameValidator: async () => true,
    maxUsernameLength: 255,
});

const authSchema = {
    Users: users,
    Session: sessions,
    Account: accounts,
    Verification: verifications,
};

export const createAuth = (db: Database) =>
    betterAuth({
        baseURL: env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL,
        basePath: "/api/auth",
        trustedOrigins: [env.OPENCLOUD_WEBUI_URL],
        secret: env.AUTH_SECRET,
        database: drizzleAdapter(db, {
            provider: "pg",
            schema: authSchema,
            usePlural: false,
            camelCase: true,
        }),
        user: {
            modelName: "Users",
            additionalFields: {
                rootFolderId: { type: "string", required: true, input: false },
                firstName: { type: "string", required: false, input: false },
                lastName: { type: "string", required: false, input: false },
            },
        },
        session: { modelName: "Session" },
        account: { modelName: "Account" },
        verification: { modelName: "Verification" },
        emailAndPassword: {
            enabled: true,
            disableSignUp: true,
            password: {
                hash: async (password) => argon2.hash(password),
                verify: async ({ hash, password }) => argon2.verify(hash, password),
            },
        },
        plugins: [usernamePlugin],
        disabledPaths: ["/sign-up/email", "/sign-in/email"],
        advanced: {
            cookiePrefix: "opencloud",
            crossSubDomainCookies: env.COOKIE_URL
                ? { enabled: crossSubDomainCookiesEnabled, domain: env.COOKIE_URL }
                : { enabled: false },
        },
    });

export type AuthInstance = ReturnType<typeof createAuth>;
