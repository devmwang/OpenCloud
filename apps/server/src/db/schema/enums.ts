import { pgEnum } from "drizzle-orm/pg-core";

export const allowDisallowEnum = pgEnum("AllowDisallow", ["ALLOW", "DISALLOW"]);
export const accessRuleMethodEnum = pgEnum("AccessRuleMethod", ["IP_ADDRESS"]);
export const displayTypeEnum = pgEnum("DisplayType", ["GRID", "LIST"]);
export const roleEnum = pgEnum("Role", ["ADMIN", "USER"]);
export const folderTypeEnum = pgEnum("FolderType", ["ROOT", "STANDARD"]);
export const fileAccessEnum = pgEnum("FileAccess", ["PRIVATE", "PROTECTED", "PUBLIC"]);
export const fileStorageStateEnum = pgEnum("FileStorageState", ["PENDING", "READY", "FAILED"]);
export const sortDirectionEnum = pgEnum("SortDirection", ["ASC", "DESC"]);
export const sortTypeEnum = pgEnum("SortType", ["NAME", "DATE_CREATED", "SIZE"]);

export type AllowDisallow = (typeof allowDisallowEnum.enumValues)[number];
export type AccessRuleMethod = (typeof accessRuleMethodEnum.enumValues)[number];
export type DisplayType = (typeof displayTypeEnum.enumValues)[number];
export type Role = (typeof roleEnum.enumValues)[number];
export type FolderType = (typeof folderTypeEnum.enumValues)[number];
export type FileAccess = (typeof fileAccessEnum.enumValues)[number];
export type FileStorageState = (typeof fileStorageStateEnum.enumValues)[number];
export type SortDirection = (typeof sortDirectionEnum.enumValues)[number];
export type SortType = (typeof sortTypeEnum.enumValues)[number];
