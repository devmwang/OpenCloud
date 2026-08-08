ALTER TABLE "UploadTokens"
    ADD CONSTRAINT "UploadTokens_folderId_userId_fkey_cascade"
    FOREIGN KEY ("folderId", "userId") REFERENCES "public"."Folders"("id", "ownerId") ON DELETE cascade ON UPDATE cascade
    NOT VALID;
--> statement-breakpoint
ALTER TABLE "UploadTokens" VALIDATE CONSTRAINT "UploadTokens_folderId_userId_fkey_cascade";
--> statement-breakpoint
ALTER TABLE "UploadTokens" DROP CONSTRAINT "UploadTokens_folderId_userId_fkey";
--> statement-breakpoint
ALTER TABLE "UploadTokens"
    RENAME CONSTRAINT "UploadTokens_folderId_userId_fkey_cascade" TO "UploadTokens_folderId_userId_fkey";
--> statement-breakpoint
ALTER TABLE "Folders"
    ADD CONSTRAINT "Folders_parentFolderId_ownerId_fkey_no_action"
    FOREIGN KEY ("parentFolderId", "ownerId") REFERENCES "public"."Folders"("id", "ownerId") ON DELETE no action ON UPDATE cascade
    NOT VALID;
--> statement-breakpoint
ALTER TABLE "Folders" VALIDATE CONSTRAINT "Folders_parentFolderId_ownerId_fkey_no_action";
--> statement-breakpoint
ALTER TABLE "Folders" DROP CONSTRAINT "Folders_parentFolderId_ownerId_fkey";
--> statement-breakpoint
ALTER TABLE "Folders"
    RENAME CONSTRAINT "Folders_parentFolderId_ownerId_fkey_no_action" TO "Folders_parentFolderId_ownerId_fkey";
--> statement-breakpoint
ALTER TABLE "Users"
    ADD CONSTRAINT "Users_rootFolderId_id_fkey_no_action"
    FOREIGN KEY ("rootFolderId", "id") REFERENCES "public"."Folders"("id", "ownerId") ON DELETE no action ON UPDATE cascade
    NOT VALID;
--> statement-breakpoint
ALTER TABLE "Users" VALIDATE CONSTRAINT "Users_rootFolderId_id_fkey_no_action";
--> statement-breakpoint
ALTER TABLE "Users" DROP CONSTRAINT "Users_rootFolderId_id_fkey";
--> statement-breakpoint
ALTER TABLE "Users"
    RENAME CONSTRAINT "Users_rootFolderId_id_fkey_no_action" TO "Users_rootFolderId_id_fkey";
