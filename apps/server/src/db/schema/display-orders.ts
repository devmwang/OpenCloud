import { createId } from "@paralleldrive/cuid2";
import { foreignKey, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { displayTypeEnum, sortDirectionEnum, sortTypeEnum } from "./enums";
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
    }),
);
