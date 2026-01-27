import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { displayTypeEnum, roleEnum } from "./enums";

export const users = pgTable("Users", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    username: text("username").notNull(),
    firstName: text("firstName"),
    lastName: text("lastName"),
    password: text("password").notNull(),
    role: roleEnum("role").notNull().default("USER"),
    rootFolderId: text("rootFolderId"),
    accessControlRuleIds: text("accessControlRuleIds").array(),
    defaultDisplayType: displayTypeEnum("defaultDisplayType").notNull().default("GRID"),
    createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
}, (table) => ({
    usernameKey: uniqueIndex("Users_username_key").on(table.username),
}));
