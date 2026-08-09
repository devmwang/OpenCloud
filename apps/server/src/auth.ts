import { createHmac } from "node:crypto";

import * as argon2 from "argon2";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { eq } from "drizzle-orm";

import type { Database } from "@/db";
import { accounts, sessionCookieConfigurations, sessions, users, verifications } from "@/db/schema";
import { env, sessionCookieScope, type SessionCookieScope } from "@/env/env";

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

const serializeSessionCookieScope = (scope: SessionCookieScope) =>
    scope.type === "host" ? `${scope.protocol}//${scope.hostname}` : `${scope.protocol}//${scope.domain}`;

export const getSessionCookieConfiguration = (
    scope: SessionCookieScope,
    authSecret: string,
    credentialGeneration: number,
) => {
    const serializedScope = serializeSessionCookieScope(scope);
    const credentialContext = `${scope.type}:${serializedScope}:${credentialGeneration}`;

    return {
        cookiePrefix: `opencloud-${credentialGeneration}`,
        authSecret: createHmac("sha256", authSecret)
            .update(`opencloud-cookie-signing:${credentialContext}`)
            .digest("base64url"),
    };
};

const loadSessionCookieConfiguration = async (db: Database) => {
    const scope = `${sessionCookieScope.type}:${serializeSessionCookieScope(sessionCookieScope)}`;

    const credentialGeneration = await db.transaction(async (transaction) => {
        const [inserted] = await transaction
            .insert(sessionCookieConfigurations)
            .values({ id: "active", scope, credentialGeneration: 1 })
            .onConflictDoNothing()
            .returning();

        if (inserted) {
            return inserted.credentialGeneration;
        }

        const current = (
            await transaction
                .select()
                .from(sessionCookieConfigurations)
                .where(eq(sessionCookieConfigurations.id, "active"))
                .for("update")
        )[0]!;

        if (current.scope === scope) {
            return current.credentialGeneration;
        }

        const nextGeneration = current.credentialGeneration + 1;
        await transaction.delete(sessions);
        await transaction
            .update(sessionCookieConfigurations)
            .set({ scope, credentialGeneration: nextGeneration })
            .where(eq(sessionCookieConfigurations.id, "active"));

        return nextGeneration;
    });

    return getSessionCookieConfiguration(sessionCookieScope, env.AUTH_SECRET, credentialGeneration);
};

export const createAuth = async (db: Database) => {
    const sessionCookieConfiguration = await loadSessionCookieConfiguration(db);

    return betterAuth({
        baseURL: env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL,
        basePath: "/api/auth",
        trustedOrigins: [env.OPENCLOUD_WEBUI_URL],
        secret: sessionCookieConfiguration.authSecret,
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
            cookiePrefix: sessionCookieConfiguration.cookiePrefix,
            crossSubDomainCookies:
                sessionCookieScope.type === "domain"
                    ? { enabled: true, domain: sessionCookieScope.domain }
                    : { enabled: false },
        },
    });
};

export type AuthInstance = Awaited<ReturnType<typeof createAuth>>;
