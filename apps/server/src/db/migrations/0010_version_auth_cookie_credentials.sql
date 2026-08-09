CREATE TABLE "SessionCookieConfiguration" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"credentialGeneration" integer NOT NULL
);
--> statement-breakpoint
DELETE FROM "Session";
