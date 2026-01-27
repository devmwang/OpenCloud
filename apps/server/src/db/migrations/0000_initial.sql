CREATE TYPE "public"."AccessRuleMethod" AS ENUM('IP_ADDRESS');--> statement-breakpoint
CREATE TYPE "public"."AllowDisallow" AS ENUM('ALLOW', 'DISALLOW');--> statement-breakpoint
CREATE TYPE "public"."DisplayType" AS ENUM('GRID', 'LIST');--> statement-breakpoint
CREATE TYPE "public"."FileAccess" AS ENUM('PRIVATE', 'PROTECTED', 'PUBLIC');--> statement-breakpoint
CREATE TYPE "public"."FolderType" AS ENUM('ROOT', 'STANDARD');--> statement-breakpoint
CREATE TYPE "public"."Role" AS ENUM('ADMIN', 'USER');--> statement-breakpoint
CREATE TYPE "public"."SortDirection" AS ENUM('ASC', 'DESC');--> statement-breakpoint
CREATE TYPE "public"."SortType" AS ENUM('NAME', 'DATE_CREATED', 'SIZE');--> statement-breakpoint
CREATE TABLE "Users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"firstName" text,
	"lastName" text,
	"password" text NOT NULL,
	"role" "Role" DEFAULT 'USER' NOT NULL,
	"rootFolderId" text,
	"accessControlRuleIds" text[],
	"defaultDisplayType" "DisplayType" DEFAULT 'GRID' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AccessRules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "AllowDisallow" NOT NULL,
	"method" "AccessRuleMethod" NOT NULL,
	"match" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "RefreshTokens" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"valid" boolean DEFAULT true NOT NULL,
	"expiresAt" timestamp (3) NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "UploadTokens" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"description" text,
	"folderId" text NOT NULL,
	"fileAccess" "FileAccess" NOT NULL,
	"accessControlRuleIds" text[],
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Files" (
	"id" text PRIMARY KEY NOT NULL,
	"fileName" text NOT NULL,
	"fileSize" integer,
	"fileType" text NOT NULL,
	"ownerId" text NOT NULL,
	"fileAccess" "FileAccess" DEFAULT 'PRIVATE' NOT NULL,
	"parentId" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Folders" (
	"id" text PRIMARY KEY NOT NULL,
	"folderName" text NOT NULL,
	"ownerId" text NOT NULL,
	"type" "FolderType" DEFAULT 'STANDARD' NOT NULL,
	"parentFolderId" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "DisplayOrders" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"folderId" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"DisplayType" "DisplayType" NOT NULL,
	"SortOrder" "SortDirection" NOT NULL,
	"SortType" "SortType" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "RefreshTokens" ADD CONSTRAINT "RefreshTokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."Users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "UploadTokens" ADD CONSTRAINT "UploadTokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."Users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Files" ADD CONSTRAINT "Files_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."Folders"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Folders" ADD CONSTRAINT "Folders_parentFolderId_fkey" FOREIGN KEY ("parentFolderId") REFERENCES "public"."Folders"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DisplayOrders" ADD CONSTRAINT "DisplayOrders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."Users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "Users_username_key" ON "Users" USING btree ("username");