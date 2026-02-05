import { createId } from "@paralleldrive/cuid2";
import { foreignKey, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { fileAccessEnum } from "./enums";
import { files } from "./storage";
import { users } from "./users";

export const uploadTokens = pgTable(
    "UploadTokens",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => createId()),
        userId: text("userId").notNull(),
        description: text("description"),
        folderId: text("folderId").notNull(),
        fileAccess: fileAccessEnum("fileAccess").notNull(),
        accessControlRuleIds: text("accessControlRuleIds").array(),
        expiresAt: timestamp("expiresAt", { mode: "date", precision: 3 }),
        createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
        updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    },
    (table) => ({
        userIdFk: foreignKey({
            columns: [table.userId],
            foreignColumns: [users.id],
            name: "UploadTokens_userId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("restrict"),
    }),
);

export const fileReadTokens = pgTable(
    "FileReadTokens",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => createId()),
        userId: text("userId").notNull(),
        fileId: text("fileId").notNull(),
        description: text("description"),
        expiresAt: timestamp("expiresAt", { mode: "date", precision: 3 }),
        createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
        updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    },
    (table) => ({
        userIdFk: foreignKey({
            columns: [table.userId],
            foreignColumns: [users.id],
            name: "FileReadTokens_userId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("restrict"),
        fileIdFk: foreignKey({
            columns: [table.fileId],
            foreignColumns: [files.id],
            name: "FileReadTokens_fileId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("cascade"),
    }),
);
