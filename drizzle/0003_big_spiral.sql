CREATE TYPE "public"."entry_status" AS ENUM('draft', 'submitted', 'locked', 'scored', 'disqualified');--> statement-breakpoint
CREATE TABLE "contest_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contest_week_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "entry_status" DEFAULT 'draft' NOT NULL,
	"draft_picks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"draft_monday_prediction" integer,
	"current_version_number" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contest_entries_monday_prediction_nonnegative_check" CHECK ("contest_entries"."draft_monday_prediction" is null or "contest_entries"."draft_monday_prediction" >= 0),
	CONSTRAINT "contest_entries_version_nonnegative_check" CHECK ("contest_entries"."current_version_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "entry_version_picks" (
	"entry_version_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"selected_team_code" varchar(5) NOT NULL,
	CONSTRAINT "entry_version_picks_entry_version_id_game_id_pk" PRIMARY KEY("entry_version_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "entry_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contest_entry_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"submission_key" uuid NOT NULL,
	"action" varchar(16) NOT NULL,
	"monday_prediction" integer NOT NULL,
	"eligibility_snapshot" jsonb NOT NULL,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_versions_version_positive_check" CHECK ("entry_versions"."version_number" > 0),
	CONSTRAINT "entry_versions_monday_prediction_nonnegative_check" CHECK ("entry_versions"."monday_prediction" >= 0),
	CONSTRAINT "entry_versions_action_check" CHECK ("entry_versions"."action" in ('submit', 'edit'))
);
--> statement-breakpoint
ALTER TABLE "contest_entries" ADD CONSTRAINT "contest_entries_contest_week_id_contest_weeks_id_fk" FOREIGN KEY ("contest_week_id") REFERENCES "public"."contest_weeks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_entries" ADD CONSTRAINT "contest_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_version_picks" ADD CONSTRAINT "entry_version_picks_entry_version_id_entry_versions_id_fk" FOREIGN KEY ("entry_version_id") REFERENCES "public"."entry_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_version_picks" ADD CONSTRAINT "entry_version_picks_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_versions" ADD CONSTRAINT "entry_versions_contest_entry_id_contest_entries_id_fk" FOREIGN KEY ("contest_entry_id") REFERENCES "public"."contest_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contest_entries_week_user_unique" ON "contest_entries" USING btree ("contest_week_id","user_id");--> statement-breakpoint
CREATE INDEX "contest_entries_week_status_idx" ON "contest_entries" USING btree ("contest_week_id","status");--> statement-breakpoint
CREATE INDEX "entry_version_picks_game_idx" ON "entry_version_picks" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entry_versions_entry_version_unique" ON "entry_versions" USING btree ("contest_entry_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "entry_versions_submission_key_unique" ON "entry_versions" USING btree ("submission_key");