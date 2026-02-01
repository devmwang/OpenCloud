ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "displayUsername" text;--> statement-breakpoint
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "name" text;--> statement-breakpoint
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "email" text;--> statement-breakpoint
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "emailVerified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "image" text;--> statement-breakpoint
UPDATE "Users" SET "displayUsername" = "username" WHERE "displayUsername" IS NULL;--> statement-breakpoint
UPDATE "Users"
SET "name" = COALESCE(NULLIF(TRIM(CONCAT_WS(' ', "firstName", "lastName")), ''), "username")
WHERE "name" IS NULL;--> statement-breakpoint
UPDATE "Users" SET "email" = CONCAT("id", '@opencloud.local') WHERE "email" IS NULL;--> statement-breakpoint
DO $$ BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Users' AND column_name = 'name'
    ) THEN
        ALTER TABLE "Users" ALTER COLUMN "name" SET NOT NULL;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Users' AND column_name = 'email'
    ) THEN
        ALTER TABLE "Users" ALTER COLUMN "email" SET NOT NULL;
    END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Users_email_unique" ON "Users" ("email");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp (3) NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp (3),
	"refreshTokenExpiresAt" timestamp (3),
	"scope" text,
	"password" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp (3) NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_unique" ON "Session" ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session" ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account" ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_account_unique" ON "Account" ("providerId","accountId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Verification_identifier_idx" ON "Verification" ("identifier");--> statement-breakpoint
DO $$ BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Session'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Session_userId_Users_id_fk'
    ) THEN
        ALTER TABLE "Session"
            ADD CONSTRAINT "Session_userId_Users_id_fk" FOREIGN KEY ("userId")
            REFERENCES "public"."Users"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Account'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Account_userId_Users_id_fk'
    ) THEN
        ALTER TABLE "Account"
            ADD CONSTRAINT "Account_userId_Users_id_fk" FOREIGN KEY ("userId")
            REFERENCES "public"."Users"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Users' AND column_name = 'password'
    ) THEN
        INSERT INTO "Account" ("id","accountId","providerId","userId","password","createdAt","updatedAt")
        SELECT u."id", u."id", 'credential', u."id", u."password", now(), now()
        FROM "Users" u
        WHERE NOT EXISTS (
            SELECT 1
            FROM "Account" a
            WHERE a."providerId" = 'credential' AND a."accountId" = u."id"
        );
    END IF;
END $$;--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_sessions ON "Session";--> statement-breakpoint
CREATE TRIGGER set_updated_at_sessions
BEFORE UPDATE ON "Session"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_accounts ON "Account";--> statement-breakpoint
CREATE TRIGGER set_updated_at_accounts
BEFORE UPDATE ON "Account"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_verifications ON "Verification";--> statement-breakpoint
CREATE TRIGGER set_updated_at_verifications
BEFORE UPDATE ON "Verification"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "Users" DROP COLUMN IF EXISTS "password";--> statement-breakpoint
DROP TABLE IF EXISTS "RefreshTokens";--> statement-breakpoint
