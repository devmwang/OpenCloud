CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_users ON "Users";
CREATE TRIGGER set_updated_at_users
BEFORE UPDATE ON "Users"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_access_rules ON "AccessRules";
CREATE TRIGGER set_updated_at_access_rules
BEFORE UPDATE ON "AccessRules"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_refresh_tokens ON "RefreshTokens";
CREATE TRIGGER set_updated_at_refresh_tokens
BEFORE UPDATE ON "RefreshTokens"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_upload_tokens ON "UploadTokens";
CREATE TRIGGER set_updated_at_upload_tokens
BEFORE UPDATE ON "UploadTokens"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_folders ON "Folders";
CREATE TRIGGER set_updated_at_folders
BEFORE UPDATE ON "Folders"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_files ON "Files";
CREATE TRIGGER set_updated_at_files
BEFORE UPDATE ON "Files"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
