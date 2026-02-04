import { createId } from "@paralleldrive/cuid2";
import { bigint, foreignKey, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { fileAccessEnum, folderTypeEnum } from "./enums";

export const folders = pgTable(
    "Folders",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => createId()),
        folderName: text("folderName").notNull(),
        ownerId: text("ownerId").notNull(),
        type: folderTypeEnum("type").notNull().default("STANDARD"),
        parentFolderId: text("parentFolderId"),
        createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
        updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    },
    (table) => ({
        parentFolderIdFk: foreignKey({
            columns: [table.parentFolderId],
            foreignColumns: [table.id],
            name: "Folders_parentFolderId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("set null"),
    }),
);

export const files = pgTable(
    "Files",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => createId()),
        fileName: text("fileName").notNull(),
        fileSize: bigint("fileSize", { mode: "number" }),
        fileType: text("fileType").notNull(),
        ownerId: text("ownerId").notNull(),
        fileAccess: fileAccessEnum("fileAccess").notNull().default("PRIVATE"),
        parentId: text("parentId").notNull(),
        createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
        updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    },
    (table) => ({
        parentIdFk: foreignKey({
            columns: [table.parentId],
            foreignColumns: [folders.id],
            name: "Files_parentId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("restrict"),
    }),
);
