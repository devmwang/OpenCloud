import { createId } from "@paralleldrive/cuid2";
import { customType, foreignKey, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { accessRuleMethodEnum, allowDisallowEnum } from "./enums";
import { users } from "./users";

const cidr = customType<{ data: string }>({
    dataType() {
        return "cidr";
    },
});

export const accessRules = pgTable(
    "AccessRules",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => createId()),
        name: text("name").notNull(),
        type: allowDisallowEnum("type").notNull(),
        method: accessRuleMethodEnum("method").notNull(),
        cidr: cidr("cidr").notNull(),
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
        ownerIdIdx: index("AccessRules_ownerId_idx").on(table.ownerId),
        ownerCidrIdx: index("AccessRules_ownerId_cidr_idx").on(table.ownerId, table.cidr),
    }),
);
