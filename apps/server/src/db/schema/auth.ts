import { createId } from "@paralleldrive/cuid2";
import { boolean, foreignKey, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { fileAccessEnum } from "./enums";
import { users } from "./users";

export const refreshTokens = pgTable("RefreshTokens", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("userId").notNull(),
    valid: boolean("valid").notNull().default(true),
    expiresAt: timestamp("expiresAt", { mode: "date", precision: 3 }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
}, (table) => ({
    userIdFk: foreignKey({
        columns: [table.userId],
        foreignColumns: [users.id],
        name: "RefreshTokens_userId_fkey",
    }).onUpdate("cascade").onDelete("restrict"),
}));

export const uploadTokens = pgTable("UploadTokens", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("userId").notNull(),
    description: text("description"),
    folderId: text("folderId").notNull(),
    fileAccess: fileAccessEnum("fileAccess").notNull(),
    accessControlRuleIds: text("accessControlRuleIds").array(),
    createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
}, (table) => ({
    userIdFk: foreignKey({
        columns: [table.userId],
        foreignColumns: [users.id],
        name: "UploadTokens_userId_fkey",
    }).onUpdate("cascade").onDelete("restrict"),
}));
