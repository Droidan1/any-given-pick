CREATE TYPE "public"."contest_week_status" AS ENUM('draft', 'published', 'locked', 'final');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('scheduled', 'in_progress', 'final', 'postponed', 'canceled');--> statement-breakpoint
CREATE TABLE "contest_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season" integer NOT NULL,
	"week_number" integer NOT NULL,
	"label" varchar(80),
	"status" "contest_week_status" DEFAULT 'draft' NOT NULL,
	"entry_deadline" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contest_weeks_week_number_check" CHECK ("contest_weeks"."week_number" between 1 and 22),
	CONSTRAINT "contest_weeks_season_check" CHECK ("contest_weeks"."season" between 2020 and 2100)
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contest_week_id" uuid NOT NULL,
	"provider" varchar(48) DEFAULT 'manual' NOT NULL,
	"provider_game_key" varchar(160),
	"kickoff_at" timestamp with time zone NOT NULL,
	"away_team_code" varchar(5) NOT NULL,
	"away_team_name" varchar(80) NOT NULL,
	"home_team_code" varchar(5) NOT NULL,
	"home_team_name" varchar(80) NOT NULL,
	"status" "game_status" DEFAULT 'scheduled' NOT NULL,
	"away_score" integer,
	"home_score" integer,
	"is_monday_tiebreaker" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_scores_nonnegative_check" CHECK (("games"."away_score" is null or "games"."away_score" >= 0) and ("games"."home_score" is null or "games"."home_score" >= 0)),
	CONSTRAINT "games_distinct_teams_check" CHECK ("games"."away_team_code" <> "games"."home_team_code")
);
--> statement-breakpoint
ALTER TABLE "contest_weeks" ADD CONSTRAINT "contest_weeks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_contest_week_id_contest_weeks_id_fk" FOREIGN KEY ("contest_week_id") REFERENCES "public"."contest_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contest_weeks_season_week_unique" ON "contest_weeks" USING btree ("season","week_number");--> statement-breakpoint
CREATE INDEX "contest_weeks_status_deadline_idx" ON "contest_weeks" USING btree ("status","entry_deadline");--> statement-breakpoint
CREATE INDEX "games_week_kickoff_idx" ON "games" USING btree ("contest_week_id","kickoff_at");--> statement-breakpoint
CREATE UNIQUE INDEX "games_week_provider_key_unique" ON "games" USING btree ("contest_week_id","provider","provider_game_key");--> statement-breakpoint
CREATE UNIQUE INDEX "games_week_matchup_kickoff_unique" ON "games" USING btree ("contest_week_id","away_team_code","home_team_code","kickoff_at");--> statement-breakpoint
CREATE UNIQUE INDEX "games_one_monday_tiebreaker_per_week" ON "games" USING btree ("contest_week_id") WHERE "games"."is_monday_tiebreaker" = true;