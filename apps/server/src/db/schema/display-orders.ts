import { createId } from "@paralleldrive/cuid2";
import { foreignKey, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { displayTypeEnum, sortDirectionEnum, sortTypeEnum } from "./enums";
import { folders } from "./storage";
import { users } from "./users";

export const displayOrders = pgTable(
    "DisplayOrders",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => createId()),
        userId: text("userId").notNull(),
        folderId: text("folderId").notNull(),
        createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
        updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
        displayType: displayTypeEnum("DisplayType").notNull(),
        sortOrder: sortDirectionEnum("SortOrder").notNull(),
        sortType: sortTypeEnum("SortType").notNull(),
    },
    (table) => ({
        userIdFk: foreignKey({
            columns: [table.userId],
            foreignColumns: [users.id],
            name: "DisplayOrders_userId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("restrict"),
        folderOwnerFk: foreignKey({
            columns: [table.folderId, table.userId],
            foreignColumns: [folders.id, folders.ownerId],
            name: "DisplayOrders_folderId_userId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("cascade"),
        userFolderKey: uniqueIndex("DisplayOrders_userId_folderId_key").on(table.userId, table.folderId),
        folderIdIdx: index("DisplayOrders_folderId_idx").on(table.folderId),
    }),
);
