ALTER TABLE "Folders" DROP CONSTRAINT "Folders_parentFolderId_ownerId_fkey";--> statement-breakpoint
ALTER TABLE "Folders" ADD CONSTRAINT "Folders_parentFolderId_ownerId_fkey" FOREIGN KEY ("parentFolderId", "ownerId") REFERENCES "public"."Folders"("id", "ownerId") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "UploadTokens" DROP CONSTRAINT "UploadTokens_folderId_userId_fkey";--> statement-breakpoint
ALTER TABLE "UploadTokens" ADD CONSTRAINT "UploadTokens_folderId_userId_fkey" FOREIGN KEY ("folderId", "userId") REFERENCES "public"."Folders"("id", "ownerId") ON DELETE cascade ON UPDATE cascade;
