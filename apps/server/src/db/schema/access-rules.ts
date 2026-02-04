import { createId } from "@paralleldrive/cuid2";
import { foreignKey, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { accessRuleMethodEnum, allowDisallowEnum } from "./enums";
import { users } from "./users";

export const accessRules = pgTable(
    "AccessRules",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => createId()),
        name: text("name").notNull(),
        type: allowDisallowEnum("type").notNull(),
        method: accessRuleMethodEnum("method").notNull(),
        match: text("match").notNull(),
        ownerId: text("ownerId").notNull(),
        createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
        updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    },
    (table) => ({
        ownerIdFk: foreignKey({
            columns: [table.ownerId],
            foreignColumns: [users.id],
            name: "AccessRules_ownerId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("restrict"),
    }),
);
