import { pgEnum } from "drizzle-orm/pg-core";

export const allowDisallowEnum = pgEnum("AllowDisallow", ["ALLOW", "DISALLOW"]);
export const accessRuleMethodEnum = pgEnum("AccessRuleMethod", ["IP_ADDRESS"]);
export const roleEnum = pgEnum("Role", ["ADMIN", "USER"]);
export const folderTypeEnum = pgEnum("FolderType", ["ROOT", "STANDARD"]);
export const fileAccessEnum = pgEnum("FileAccess", ["PRIVATE", "PROTECTED", "PUBLIC"]);

export type AllowDisallow = (typeof allowDisallowEnum.enumValues)[number];
export type AccessRuleMethod = (typeof accessRuleMethodEnum.enumValues)[number];
export type Role = (typeof roleEnum.enumValues)[number];
export type FolderType = (typeof folderTypeEnum.enumValues)[number];
export type FileAccess = (typeof fileAccessEnum.enumValues)[number];
