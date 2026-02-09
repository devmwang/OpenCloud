import { createId } from "@paralleldrive/cuid2";
import { foreignKey, index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { accessRules } from "./access-rules";
import { fileAccessEnum } from "./enums";
import { files, folders } from "./storage";
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
        folderOwnerFk: foreignKey({
            columns: [table.folderId, table.userId],
            foreignColumns: [folders.id, folders.ownerId],
            name: "UploadTokens_folderId_userId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("restrict"),
        userIdIdx: index("UploadTokens_userId_idx").on(table.userId),
        folderIdIdx: index("UploadTokens_folderId_idx").on(table.folderId),
        expiresAtIdx: index("UploadTokens_expiresAt_idx").on(table.expiresAt),
    }),
);

export const uploadTokenRules = pgTable(
    "UploadTokenRules",
    {
        uploadTokenId: text("uploadTokenId").notNull(),
        accessRuleId: text("accessRuleId").notNull(),
        createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    },
    (table) => ({
        pk: primaryKey({
            columns: [table.uploadTokenId, table.accessRuleId],
            name: "UploadTokenRules_pkey",
        }),
        uploadTokenFk: foreignKey({
            columns: [table.uploadTokenId],
            foreignColumns: [uploadTokens.id],
            name: "UploadTokenRules_uploadTokenId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("cascade"),
        accessRuleFk: foreignKey({
            columns: [table.accessRuleId],
            foreignColumns: [accessRules.id],
            name: "UploadTokenRules_accessRuleId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("cascade"),
        accessRuleIdIdx: index("UploadTokenRules_accessRuleId_idx").on(table.accessRuleId),
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
        fileOwnerFk: foreignKey({
            columns: [table.fileId, table.userId],
            foreignColumns: [files.id, files.ownerId],
            name: "FileReadTokens_fileId_userId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("cascade"),
        userIdIdx: index("FileReadTokens_userId_idx").on(table.userId),
        fileIdIdx: index("FileReadTokens_fileId_idx").on(table.fileId),
        expiresAtIdx: index("FileReadTokens_expiresAt_idx").on(table.expiresAt),
    }),
);
