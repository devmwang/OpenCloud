DO $$
BEGIN
    CREATE TYPE "public"."FileStorageState" AS ENUM('PENDING', 'READY', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "Users" DROP COLUMN IF EXISTS "accessControlRuleIds";
--> statement-breakpoint
ALTER TABLE "Folders" ADD COLUMN IF NOT EXISTS "folderPath" text;
--> statement-breakpoint
WITH canonical_roots AS (
    SELECT owner_id_rows."ownerId" AS owner_id, owner_id_rows."id" AS root_id
    FROM (
        SELECT
            "ownerId",
            "id",
            row_number() OVER (PARTITION BY "ownerId" ORDER BY "createdAt" ASC, "id" ASC) AS row_number
        FROM "Folders"
        WHERE "type" = 'ROOT'
    ) owner_id_rows
    WHERE owner_id_rows.row_number = 1
),
missing_roots AS (
    SELECT
        u."id" AS user_id,
        concat('root_', substr(md5(random()::text || clock_timestamp()::text || u."id"), 1, 24)) AS root_id
    FROM "Users" u
    LEFT JOIN canonical_roots cr
        ON cr.owner_id = u."id"
    WHERE cr.root_id IS NULL
),
inserted_roots AS (
    INSERT INTO "Folders" (
        "id",
        "folderName",
        "ownerId",
        "folderAccess",
        "type",
        "parentFolderId",
        "deletedAt",
        "folderPath",
        "createdAt",
        "updatedAt"
    )
    SELECT
        mr.root_id,
        'Files',
        mr.user_id,
        'PRIVATE',
        'ROOT',
        NULL,
        NULL,
        concat('/', mr.root_id),
        now(),
        now()
    FROM missing_roots mr
    RETURNING "id", "ownerId"
),
all_roots AS (
    SELECT cr.owner_id AS owner_id, cr.root_id AS root_id
    FROM canonical_roots cr
    UNION ALL
    SELECT ir."ownerId" AS owner_id, ir."id" AS root_id
    FROM inserted_roots ir
)
UPDATE "Users" u
SET "rootFolderId" = ar.root_id
FROM all_roots ar
WHERE u."id" = ar.owner_id
  AND (u."rootFolderId" IS DISTINCT FROM ar.root_id);
--> statement-breakpoint
WITH ranked_roots AS (
    SELECT
        "id",
        "ownerId",
        row_number() OVER (PARTITION BY "ownerId" ORDER BY "createdAt" ASC, "id" ASC) AS row_number
    FROM "Folders"
    WHERE "type" = 'ROOT'
)
UPDATE "Folders" f
SET "type" = 'STANDARD'
FROM ranked_roots rr
JOIN "Users" u
    ON u."id" = rr."ownerId"
WHERE f."id" = rr."id"
  AND rr.row_number > 1
  AND f."ownerId" = u."id";
--> statement-breakpoint
UPDATE "Folders"
SET "parentFolderId" = NULL
WHERE "type" = 'ROOT';
--> statement-breakpoint
UPDATE "Folders" f
SET "parentFolderId" = u."rootFolderId"
FROM "Users" u
WHERE f."ownerId" = u."id"
  AND f."type" = 'STANDARD'
  AND (
      f."parentFolderId" IS NULL
      OR NOT EXISTS (
          SELECT 1
          FROM "Folders" p
          WHERE p."id" = f."parentFolderId"
            AND p."ownerId" = f."ownerId"
      )
  );
--> statement-breakpoint
UPDATE "Folders"
SET "folderPath" = concat('/', "id")
WHERE "type" = 'ROOT';
--> statement-breakpoint
WITH RECURSIVE folder_paths AS (
    SELECT
        f."id",
        f."ownerId",
        concat('/', f."id") AS folder_path
    FROM "Folders" f
    WHERE f."type" = 'ROOT'

    UNION ALL

    SELECT
        child."id",
        child."ownerId",
        concat(parent_paths.folder_path, '/', child."id") AS folder_path
    FROM "Folders" child
    JOIN folder_paths parent_paths
        ON parent_paths."id" = child."parentFolderId"
       AND parent_paths."ownerId" = child."ownerId"
    WHERE child."type" = 'STANDARD'
)
UPDATE "Folders" f
SET "folderPath" = fp.folder_path
FROM folder_paths fp
WHERE f."id" = fp."id"
  AND f."ownerId" = fp."ownerId";
--> statement-breakpoint
UPDATE "Folders" f
SET
    "parentFolderId" = u."rootFolderId",
    "folderPath" = concat('/', u."rootFolderId", '/', f."id")
FROM "Users" u
WHERE f."ownerId" = u."id"
  AND f."type" = 'STANDARD'
  AND f."folderPath" IS NULL;
--> statement-breakpoint
UPDATE "Files" fi
SET "parentId" = u."rootFolderId"
FROM "Users" u
WHERE fi."ownerId" = u."id"
  AND (
      fi."parentId" IS NULL
      OR NOT EXISTS (
          SELECT 1
          FROM "Folders" f
          WHERE f."id" = fi."parentId"
            AND f."ownerId" = fi."ownerId"
      )
  );
--> statement-breakpoint
ALTER TABLE "Folders" ALTER COLUMN "folderPath" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "Files" ADD COLUMN IF NOT EXISTS "storageState" "FileStorageState";
--> statement-breakpoint
ALTER TABLE "Files" ADD COLUMN IF NOT EXISTS "storageError" text;
--> statement-breakpoint
ALTER TABLE "Files" ADD COLUMN IF NOT EXISTS "storageVerifiedAt" timestamp (3);
--> statement-breakpoint
UPDATE "Files"
SET "storageState" = 'READY'
WHERE "storageState" IS NULL;
--> statement-breakpoint
UPDATE "Files"
SET "storageVerifiedAt" = COALESCE("storageVerifiedAt", "createdAt")
WHERE "storageState" = 'READY';
--> statement-breakpoint
ALTER TABLE "Files" ALTER COLUMN "storageState" SET DEFAULT 'PENDING';
--> statement-breakpoint
ALTER TABLE "Files" ALTER COLUMN "storageState" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Folders_id_ownerId_key" ON "Folders" ("id", "ownerId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Files_id_ownerId_key" ON "Files" ("id", "ownerId");
--> statement-breakpoint
ALTER TABLE "Folders" DROP CONSTRAINT IF EXISTS "Folders_parentFolderId_fkey";
--> statement-breakpoint
ALTER TABLE "Files" DROP CONSTRAINT IF EXISTS "Files_parentId_fkey";
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Folders_ownerId_fkey') THEN
        ALTER TABLE "Folders"
            ADD CONSTRAINT "Folders_ownerId_fkey"
            FOREIGN KEY ("ownerId") REFERENCES "public"."Users"("id") ON DELETE restrict ON UPDATE cascade;
    END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Folders_parentFolderId_ownerId_fkey') THEN
        ALTER TABLE "Folders"
            ADD CONSTRAINT "Folders_parentFolderId_ownerId_fkey"
            FOREIGN KEY ("parentFolderId", "ownerId") REFERENCES "public"."Folders"("id", "ownerId") ON DELETE set null ON UPDATE cascade;
    END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Files_ownerId_fkey') THEN
        ALTER TABLE "Files"
            ADD CONSTRAINT "Files_ownerId_fkey"
            FOREIGN KEY ("ownerId") REFERENCES "public"."Users"("id") ON DELETE restrict ON UPDATE cascade;
    END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Files_parentId_ownerId_fkey') THEN
        ALTER TABLE "Files"
            ADD CONSTRAINT "Files_parentId_ownerId_fkey"
            FOREIGN KEY ("parentId", "ownerId") REFERENCES "public"."Folders"("id", "ownerId") ON DELETE restrict ON UPDATE cascade;
    END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Users_rootFolderId_id_fkey') THEN
        ALTER TABLE "Users"
            ADD CONSTRAINT "Users_rootFolderId_id_fkey"
            FOREIGN KEY ("rootFolderId", "id") REFERENCES "public"."Folders"("id", "ownerId") ON DELETE set null ON UPDATE cascade;
    END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Folders_root_parent_shape_check') THEN
        ALTER TABLE "Folders"
            ADD CONSTRAINT "Folders_root_parent_shape_check"
            CHECK ((("type" = 'ROOT' AND "parentFolderId" IS NULL) OR ("type" = 'STANDARD' AND "parentFolderId" IS NOT NULL)));
    END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Folders_owner_root_unique" ON "Folders" ("ownerId") WHERE "type" = 'ROOT';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Users_rootFolderId_idx" ON "Users" ("rootFolderId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Folders_owner_folderPath_idx" ON "Folders" ("ownerId", "folderPath");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Folders_owner_parent_active_idx" ON "Folders" ("ownerId", "parentFolderId", "folderName", "id") WHERE "deletedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Folders_owner_deletedAt_idx" ON "Folders" ("ownerId", "deletedAt", "id") WHERE "deletedAt" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Files_owner_parent_active_idx" ON "Files" ("ownerId", "parentId", "createdAt", "id") WHERE "deletedAt" IS NULL AND "storageState" = 'READY';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Files_owner_deletedAt_idx" ON "Files" ("ownerId", "deletedAt", "id") WHERE "deletedAt" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Files_owner_storageState_idx" ON "Files" ("ownerId", "storageState", "updatedAt");
--> statement-breakpoint
DROP TABLE IF EXISTS "UploadTokenRules";
--> statement-breakpoint
DROP TABLE IF EXISTS "FileReadTokens";
--> statement-breakpoint
DROP TABLE IF EXISTS "UploadTokens";
--> statement-breakpoint
DROP TABLE IF EXISTS "DisplayOrders";
--> statement-breakpoint
DROP TABLE IF EXISTS "AccessRules";
--> statement-breakpoint
CREATE TABLE "AccessRules" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "type" "AllowDisallow" NOT NULL,
    "method" "AccessRuleMethod" NOT NULL,
    "cidr" cidr NOT NULL,
    "ownerId" text NOT NULL,
    "createdAt" timestamp (3) DEFAULT now() NOT NULL,
    "updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "AccessRules"
    ADD CONSTRAINT "AccessRules_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "public"."Users"("id") ON DELETE restrict ON UPDATE cascade;
--> statement-breakpoint
CREATE INDEX "AccessRules_ownerId_idx" ON "AccessRules" ("ownerId");
--> statement-breakpoint
CREATE INDEX "AccessRules_ownerId_cidr_idx" ON "AccessRules" ("ownerId", "cidr");
--> statement-breakpoint
CREATE TABLE "UploadTokens" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL,
    "description" text,
    "folderId" text NOT NULL,
    "fileAccess" "FileAccess" NOT NULL,
    "expiresAt" timestamp (3),
    "createdAt" timestamp (3) DEFAULT now() NOT NULL,
    "updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "UploadTokens"
    ADD CONSTRAINT "UploadTokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "public"."Users"("id") ON DELETE restrict ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "UploadTokens"
    ADD CONSTRAINT "UploadTokens_folderId_userId_fkey"
    FOREIGN KEY ("folderId", "userId") REFERENCES "public"."Folders"("id", "ownerId") ON DELETE restrict ON UPDATE cascade;
--> statement-breakpoint
CREATE INDEX "UploadTokens_userId_idx" ON "UploadTokens" ("userId");
--> statement-breakpoint
CREATE INDEX "UploadTokens_folderId_idx" ON "UploadTokens" ("folderId");
--> statement-breakpoint
CREATE INDEX "UploadTokens_expiresAt_idx" ON "UploadTokens" ("expiresAt");
--> statement-breakpoint
CREATE TABLE "UploadTokenRules" (
    "uploadTokenId" text NOT NULL,
    "accessRuleId" text NOT NULL,
    "createdAt" timestamp (3) DEFAULT now() NOT NULL,
    CONSTRAINT "UploadTokenRules_pkey" PRIMARY KEY("uploadTokenId", "accessRuleId")
);
--> statement-breakpoint
ALTER TABLE "UploadTokenRules"
    ADD CONSTRAINT "UploadTokenRules_uploadTokenId_fkey"
    FOREIGN KEY ("uploadTokenId") REFERENCES "public"."UploadTokens"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "UploadTokenRules"
    ADD CONSTRAINT "UploadTokenRules_accessRuleId_fkey"
    FOREIGN KEY ("accessRuleId") REFERENCES "public"."AccessRules"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
CREATE INDEX "UploadTokenRules_accessRuleId_idx" ON "UploadTokenRules" ("accessRuleId");
--> statement-breakpoint
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
ALTER TABLE "FileReadTokens"
    ADD CONSTRAINT "FileReadTokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "public"."Users"("id") ON DELETE restrict ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "FileReadTokens"
    ADD CONSTRAINT "FileReadTokens_fileId_fkey"
    FOREIGN KEY ("fileId") REFERENCES "public"."Files"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "FileReadTokens"
    ADD CONSTRAINT "FileReadTokens_fileId_userId_fkey"
    FOREIGN KEY ("fileId", "userId") REFERENCES "public"."Files"("id", "ownerId") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
CREATE INDEX "FileReadTokens_userId_idx" ON "FileReadTokens" ("userId");
--> statement-breakpoint
CREATE INDEX "FileReadTokens_fileId_idx" ON "FileReadTokens" ("fileId");
--> statement-breakpoint
CREATE INDEX "FileReadTokens_expiresAt_idx" ON "FileReadTokens" ("expiresAt");
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
ALTER TABLE "DisplayOrders"
    ADD CONSTRAINT "DisplayOrders_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "public"."Users"("id") ON DELETE restrict ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "DisplayOrders"
    ADD CONSTRAINT "DisplayOrders_folderId_userId_fkey"
    FOREIGN KEY ("folderId", "userId") REFERENCES "public"."Folders"("id", "ownerId") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX "DisplayOrders_userId_folderId_key" ON "DisplayOrders" ("userId", "folderId");
--> statement-breakpoint
CREATE INDEX "DisplayOrders_folderId_idx" ON "DisplayOrders" ("folderId");
--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_access_rules ON "AccessRules";
CREATE TRIGGER set_updated_at_access_rules
BEFORE UPDATE ON "AccessRules"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_upload_tokens ON "UploadTokens";
CREATE TRIGGER set_updated_at_upload_tokens
BEFORE UPDATE ON "UploadTokens"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_file_read_tokens ON "FileReadTokens";
CREATE TRIGGER set_updated_at_file_read_tokens
BEFORE UPDATE ON "FileReadTokens"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_display_orders ON "DisplayOrders";
CREATE TRIGGER set_updated_at_display_orders
BEFORE UPDATE ON "DisplayOrders"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
