CREATE TABLE "FileReadTokens" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"fileId" text NOT NULL,
	"description" text,
	"expiresAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Files" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "FileReadTokens" ADD CONSTRAINT "FileReadTokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."Users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "FileReadTokens" ADD CONSTRAINT "FileReadTokens_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "public"."Files"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "Files_parentId_idx" ON "Files" USING btree ("parentId");--> statement-breakpoint
CREATE INDEX "Files_ownerId_idx" ON "Files" USING btree ("ownerId");--> statement-breakpoint
CREATE INDEX "Folders_ownerId_idx" ON "Folders" USING btree ("ownerId");--> statement-breakpoint
CREATE INDEX "Folders_parentFolderId_idx" ON "Folders" USING btree ("parentFolderId");--> statement-breakpoint
CREATE UNIQUE INDEX "Folders_owner_parent_name_unique" ON "Folders" USING btree ("ownerId","parentFolderId","folderName");
--> statement-breakpoint
DELETE FROM "FileReadTokens"
USING "Files"
WHERE "FileReadTokens"."fileId" = "Files"."id"
  AND "Files"."fileAccess" <> 'PROTECTED';
