DROP TRIGGER IF EXISTS set_updated_at_files ON "Files";
CREATE TRIGGER set_updated_at_files
BEFORE UPDATE OF
    "fileName",
    "fileSize",
    "ownerId",
    "fileAccess",
    "parentId",
    "storageState",
    "storageError",
    "storageVerifiedAt",
    "deletedAt"
ON "Files"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

UPDATE "Files"
SET "fileType" = 'application/octet-stream'
WHERE "storageState" = 'READY';
