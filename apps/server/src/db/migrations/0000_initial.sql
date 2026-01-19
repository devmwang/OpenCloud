CREATE TYPE "public"."AccessRuleMethod" AS ENUM('IP_ADDRESS');--> statement-breakpoint
CREATE TYPE "public"."AllowDisallow" AS ENUM('ALLOW', 'DISALLOW');--> statement-breakpoint
CREATE TYPE "public"."FileAccess" AS ENUM('PRIVATE', 'PROTECTED', 'PUBLIC');--> statement-breakpoint
CREATE TYPE "public"."FolderType" AS ENUM('ROOT', 'STANDARD');--> statement-breakpoint
CREATE TYPE "public"."Role" AS ENUM('ADMIN', 'USER');--> statement-breakpoint
CREATE TABLE "Users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"firstName" text,
	"lastName" text,
	"password" text NOT NULL,
	"role" "Role" DEFAULT 'USER' NOT NULL,
	"rootFolderId" text,
	"accessControlRuleIds" text[] DEFAULT '{}'::text[] NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "Users_username_unique" UNIQUE("username")
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
	"accessControlRuleIds" text[] DEFAULT '{}'::text[] NOT NULL,
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
ALTER TABLE "RefreshTokens" ADD CONSTRAINT "RefreshTokens_userId_Users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."Users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "UploadTokens" ADD CONSTRAINT "UploadTokens_userId_Users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."Users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Files" ADD CONSTRAINT "Files_parentId_Folders_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."Folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Folders" ADD CONSTRAINT "Folders_parentFolderId_Folders_id_fk" FOREIGN KEY ("parentFolderId") REFERENCES "public"."Folders"("id") ON DELETE no action ON UPDATE no action;