CREATE TABLE "email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"contest_week_id" uuid NOT NULL,
	"entry_version_id" uuid,
	"kind" varchar(48) NOT NULL,
	"dedupe_key" varchar(200) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_message_id" varchar(160),
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_deliveries_kind_check" CHECK ("email_deliveries"."kind" in ('week_published', 'deadline_approaching', 'picks_submitted', 'results_available')),
	CONSTRAINT "email_deliveries_status_check" CHECK ("email_deliveries"."status" in ('pending', 'processing', 'sent', 'failed', 'skipped')),
	CONSTRAINT "email_deliveries_attempt_count_nonnegative" CHECK ("email_deliveries"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "email_notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"week_published" boolean DEFAULT true NOT NULL,
	"deadline_approaching" boolean DEFAULT true NOT NULL,
	"picks_submitted" boolean DEFAULT true NOT NULL,
	"results_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_contest_week_id_contest_weeks_id_fk" FOREIGN KEY ("contest_week_id") REFERENCES "public"."contest_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_entry_version_id_entry_versions_id_fk" FOREIGN KEY ("entry_version_id") REFERENCES "public"."entry_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_notification_preferences" ADD CONSTRAINT "email_notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_deliveries_dedupe_key_unique" ON "email_deliveries" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "email_deliveries_status_attempt_idx" ON "email_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "email_deliveries_user_kind_idx" ON "email_deliveries" USING btree ("user_id","kind");