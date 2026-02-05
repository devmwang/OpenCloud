import { createId } from "@paralleldrive/cuid2";
import { bigint, foreignKey, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
        ownerIdIdx: index("Folders_ownerId_idx").on(table.ownerId),
        parentFolderIdFk: foreignKey({
            columns: [table.parentFolderId],
            foreignColumns: [table.id],
            name: "Folders_parentFolderId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("set null"),
        parentFolderIdIdx: index("Folders_parentFolderId_idx").on(table.parentFolderId),
        ownerParentNameUnique: uniqueIndex("Folders_owner_parent_name_unique").on(
            table.ownerId,
            table.parentFolderId,
            table.folderName,
        ),
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
        deletedAt: timestamp("deletedAt", { mode: "date", precision: 3 }),
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
        parentIdIdx: index("Files_parentId_idx").on(table.parentId),
        ownerIdIdx: index("Files_ownerId_idx").on(table.ownerId),
    }),
);
