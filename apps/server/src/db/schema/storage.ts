import { createId } from "@paralleldrive/cuid2";
import { foreignKey, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { fileAccessEnum, folderTypeEnum } from "./enums";

export const folders = pgTable(
    "Folders",
    {
        id: text("id").primaryKey().$defaultFn(() => createId()),
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
        }),
    }),
);

export const files = pgTable("Files", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    fileName: text("fileName").notNull(),
    fileSize: integer("fileSize"),
    fileType: text("fileType").notNull(),
    ownerId: text("ownerId").notNull(),
    fileAccess: fileAccessEnum("fileAccess").notNull().default("PRIVATE"),
    parentId: text("parentId")
        .notNull()
        .references(() => folders.id),
    createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
});
