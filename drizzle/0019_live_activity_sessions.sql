CREATE TABLE "live_activity_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"clerk_session_id" text NOT NULL,
	"environment" varchar(16) NOT NULL,
	"push_to_start_token" text,
	"authorized" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"deadline" boolean DEFAULT true NOT NULL,
	"race" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_activity_devices_installation_id_unique" UNIQUE("installation_id"),
	CONSTRAINT "live_activity_environment_check" CHECK ("live_activity_devices"."environment" in ('sandbox', 'production'))
);
--> statement-breakpoint
CREATE TABLE "live_activity_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"contest_week_id" uuid NOT NULL,
	"game_id" uuid,
	"kind" varchar(16) NOT NULL,
	"session_key" varchar(160) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"activity_id" varchar(128),
	"update_token" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"lease_until" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"content_hash" varchar(64),
	"failure_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_activity_kind_check" CHECK ("live_activity_sessions"."kind" in ('deadline', 'game', 'race')),
	CONSTRAINT "live_activity_status_check" CHECK ("live_activity_sessions"."status" in ('pending', 'starting', 'active', 'ending', 'ended', 'dismissed', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "score_period" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "score_clock" varchar(32);--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "score_detail" varchar(80);--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "score_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "live_activity_devices" ADD CONSTRAINT "live_activity_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_activity_sessions" ADD CONSTRAINT "live_activity_sessions_device_id_live_activity_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."live_activity_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_activity_sessions" ADD CONSTRAINT "live_activity_sessions_contest_week_id_contest_weeks_id_fk" FOREIGN KEY ("contest_week_id") REFERENCES "public"."contest_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_activity_sessions" ADD CONSTRAINT "live_activity_sessions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "live_activity_start_token_unique" ON "live_activity_devices" USING btree ("environment","push_to_start_token");--> statement-breakpoint
CREATE INDEX "live_activity_device_user_idx" ON "live_activity_devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "live_activity_session_key_unique" ON "live_activity_sessions" USING btree ("device_id","session_key");--> statement-breakpoint
CREATE INDEX "live_activity_session_work_idx" ON "live_activity_sessions" USING btree ("status","lease_until");