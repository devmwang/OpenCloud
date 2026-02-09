import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { fileAccessEnum, fileStorageStateEnum, folderTypeEnum } from "./enums";
import { users } from "./users";

export const folders = pgTable(
    "Folders",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => createId()),
        folderName: text("folderName").notNull(),
        ownerId: text("ownerId").notNull(),
        folderAccess: fileAccessEnum("folderAccess").notNull().default("PRIVATE"),
        type: folderTypeEnum("type").notNull().default("STANDARD"),
        parentFolderId: text("parentFolderId"),
        folderPath: text("folderPath").notNull(),
        deletedAt: timestamp("deletedAt", { mode: "date", precision: 3 }),
        createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
        updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    },
    (table) => ({
        ownerIdFk: foreignKey({
            columns: [table.ownerId],
            foreignColumns: [users.id],
            name: "Folders_ownerId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("restrict"),
        ownerIdIdx: index("Folders_ownerId_idx").on(table.ownerId),
        ownerIdIdKey: uniqueIndex("Folders_id_ownerId_key").on(table.id, table.ownerId),
        parentFolderOwnerFk: foreignKey({
            columns: [table.parentFolderId, table.ownerId],
            foreignColumns: [table.id, table.ownerId],
            name: "Folders_parentFolderId_ownerId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("set null"),
        parentFolderIdIdx: index("Folders_parentFolderId_idx").on(table.parentFolderId),
        ownerParentNameIdx: index("Folders_owner_parent_name_idx").on(
            table.ownerId,
            table.parentFolderId,
            table.folderName,
        ),
        ownerRootUnique: uniqueIndex("Folders_owner_root_unique")
            .on(table.ownerId)
            .where(sql`${table.type} = 'ROOT'`),
        folderPathIdx: index("Folders_owner_folderPath_idx").on(table.ownerId, table.folderPath),
        activeListingIdx: index("Folders_owner_parent_active_idx")
            .on(table.ownerId, table.parentFolderId, table.folderName, table.id)
            .where(sql`${table.deletedAt} is null`),
        deletedPurgeIdx: index("Folders_owner_deletedAt_idx")
            .on(table.ownerId, table.deletedAt, table.id)
            .where(sql`${table.deletedAt} is not null`),
        rootParentShapeCheck: check(
            "Folders_root_parent_shape_check",
            sql`((${table.type} = 'ROOT' and ${table.parentFolderId} is null) or (${table.type} = 'STANDARD' and ${table.parentFolderId} is not null))`,
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
        storageState: fileStorageStateEnum("storageState").notNull().default("PENDING"),
        storageError: text("storageError"),
        storageVerifiedAt: timestamp("storageVerifiedAt", { mode: "date", precision: 3 }),
        deletedAt: timestamp("deletedAt", { mode: "date", precision: 3 }),
        createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
        updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    },
    (table) => ({
        ownerIdFk: foreignKey({
            columns: [table.ownerId],
            foreignColumns: [users.id],
            name: "Files_ownerId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("restrict"),
        parentOwnerFk: foreignKey({
            columns: [table.parentId, table.ownerId],
            foreignColumns: [folders.id, folders.ownerId],
            name: "Files_parentId_ownerId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("restrict"),
        parentIdIdx: index("Files_parentId_idx").on(table.parentId),
        ownerIdIdx: index("Files_ownerId_idx").on(table.ownerId),
        idOwnerIdKey: uniqueIndex("Files_id_ownerId_key").on(table.id, table.ownerId),
        activeListingIdx: index("Files_owner_parent_active_idx")
            .on(table.ownerId, table.parentId, table.createdAt, table.id)
            .where(sql`${table.deletedAt} is null and ${table.storageState} = 'READY'`),
        deletedPurgeIdx: index("Files_owner_deletedAt_idx")
            .on(table.ownerId, table.deletedAt, table.id)
            .where(sql`${table.deletedAt} is not null`),
        storageStateIdx: index("Files_owner_storageState_idx").on(table.ownerId, table.storageState, table.updatedAt),
    }),
);
