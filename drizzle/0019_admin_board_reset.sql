ALTER TABLE "contest_entries" ADD COLUMN "last_reset_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contest_entries" ADD COLUMN "reset_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "contest_entries" ADD COLUMN "reset_version_number" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "contest_entries" ADD CONSTRAINT "contest_entries_reset_version_check" CHECK ("contest_entries"."reset_version_number" >= 0);--> statement-breakpoint
ALTER TABLE "contest_entries" ADD CONSTRAINT "contest_entries_reset_revision_check" CHECK ("contest_entries"."reset_revision" >= 0 and "contest_entries"."reset_revision" <= "contest_entries"."draft_revision");