import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { roleEnum } from "./enums";

export const users = pgTable("Users", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    username: text("username").notNull().unique(),
    firstName: text("firstName"),
    lastName: text("lastName"),
    password: text("password").notNull(),
    role: roleEnum("role").notNull().default("USER"),
    rootFolderId: text("rootFolderId"),
    accessControlRuleIds: text("accessControlRuleIds").array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp("createdAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 }).notNull().defaultNow(),
});
