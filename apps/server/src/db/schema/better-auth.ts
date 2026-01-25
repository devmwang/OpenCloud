import { createId } from "@paralleldrive/cuid2";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { users } from "./users";

export const sessions = pgTable(
    "Session",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => createId()),
        expiresAt: timestamp("expiresAt", { mode: "date", precision: 3 }).notNull(),
        token: text("token").notNull(),
        createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
        updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
        ipAddress: text("ipAddress"),
        userAgent: text("userAgent"),
        userId: text("userId")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
    },
    (table) => ({
        tokenUnique: uniqueIndex("Session_token_unique").on(table.token),
        userIdIdx: index("Session_userId_idx").on(table.userId),
    }),
);

export const accounts = pgTable(
    "Account",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => createId()),
        accountId: text("accountId").notNull(),
        providerId: text("providerId").notNull(),
        userId: text("userId")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        accessToken: text("accessToken"),
        refreshToken: text("refreshToken"),
        idToken: text("idToken"),
        accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { mode: "date", precision: 3 }),
        refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { mode: "date", precision: 3 }),
        scope: text("scope"),
        password: text("password"),
        createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
        updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    },
    (table) => ({
        userIdIdx: index("Account_userId_idx").on(table.userId),
        providerAccountUnique: uniqueIndex("Account_provider_account_unique").on(table.providerId, table.accountId),
    }),
);

export const verifications = pgTable(
    "Verification",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => createId()),
        identifier: text("identifier").notNull(),
        value: text("value").notNull(),
        expiresAt: timestamp("expiresAt", { mode: "date", precision: 3 }).notNull(),
        createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
        updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    },
    (table) => ({
        identifierIdx: index("Verification_identifier_idx").on(table.identifier),
    }),
);
