DROP INDEX "Folders_owner_parent_name_unique";--> statement-breakpoint
ALTER TABLE "Folders" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
CREATE INDEX "Folders_owner_parent_name_idx" ON "Folders" USING btree ("ownerId","parentFolderId","folderName");