CREATE TABLE "native_push_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"contest_week_id" uuid NOT NULL,
	"entry_version_id" uuid,
	"kind" varchar(48) NOT NULL,
	"dedupe_key" varchar(240) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "native_push_delivery_kind_check" CHECK ("native_push_deliveries"."kind" in ('week_published', 'deadline_approaching', 'picks_submitted', 'results_available')),
	CONSTRAINT "native_push_delivery_status_check" CHECK ("native_push_deliveries"."status" in ('pending', 'processing', 'sent', 'failed', 'skipped')),
	CONSTRAINT "native_push_delivery_attempt_check" CHECK ("native_push_deliveries"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "native_push_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"clerk_session_id" varchar(128) NOT NULL,
	"device_token" varchar(200) NOT NULL,
	"environment" varchar(16) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"week_published" boolean DEFAULT true NOT NULL,
	"deadline_approaching" boolean DEFAULT true NOT NULL,
	"picks_submitted" boolean DEFAULT true NOT NULL,
	"results_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "native_push_environment_check" CHECK ("native_push_devices"."environment" in ('sandbox', 'production'))
);
--> statement-breakpoint
ALTER TABLE "native_push_deliveries" ADD CONSTRAINT "native_push_deliveries_device_id_native_push_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."native_push_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_push_deliveries" ADD CONSTRAINT "native_push_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_push_deliveries" ADD CONSTRAINT "native_push_deliveries_contest_week_id_contest_weeks_id_fk" FOREIGN KEY ("contest_week_id") REFERENCES "public"."contest_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_push_deliveries" ADD CONSTRAINT "native_push_deliveries_entry_version_id_entry_versions_id_fk" FOREIGN KEY ("entry_version_id") REFERENCES "public"."entry_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_push_devices" ADD CONSTRAINT "native_push_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "native_push_delivery_dedupe_unique" ON "native_push_deliveries" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "native_push_delivery_pending_idx" ON "native_push_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "native_push_installation_unique" ON "native_push_devices" USING btree ("installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "native_push_token_environment_unique" ON "native_push_devices" USING btree ("device_token","environment");--> statement-breakpoint
CREATE INDEX "native_push_user_idx" ON "native_push_devices" USING btree ("user_id");