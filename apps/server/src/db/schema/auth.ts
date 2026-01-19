import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { fileAccessEnum } from "./enums";
import { users } from "./users";

export const refreshTokens = pgTable("RefreshTokens", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("userId")
        .notNull()
        .references(() => users.id),
    valid: boolean("valid").notNull().default(true),
    expiresAt: timestamp("expiresAt", { mode: "date", precision: 3 }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
});

export const uploadTokens = pgTable("UploadTokens", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("userId")
        .notNull()
        .references(() => users.id),
    description: text("description"),
    folderId: text("folderId").notNull(),
    fileAccess: fileAccessEnum("fileAccess").notNull(),
    accessControlRuleIds: text("accessControlRuleIds").array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
});
