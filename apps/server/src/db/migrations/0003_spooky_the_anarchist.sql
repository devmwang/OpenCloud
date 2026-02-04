ALTER TABLE "Files" ALTER COLUMN "fileSize" SET DATA TYPE bigint USING "fileSize"::bigint;--> statement-breakpoint
ALTER TABLE "AccessRules" ADD COLUMN "ownerId" text;--> statement-breakpoint
UPDATE "AccessRules"
SET "ownerId" = (
    SELECT "id"
    FROM "Users"
    WHERE "role" = 'ADMIN'
    ORDER BY "createdAt" ASC
    LIMIT 1
)
WHERE "ownerId" IS NULL;--> statement-breakpoint
ALTER TABLE "AccessRules" ALTER COLUMN "ownerId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "UploadTokens" ADD COLUMN "expiresAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "AccessRules" ADD CONSTRAINT "AccessRules_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."Users"("id") ON DELETE restrict ON UPDATE cascade;
