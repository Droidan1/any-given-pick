CREATE TYPE "public"."season_phase" AS ENUM('preseason', 'regular');--> statement-breakpoint
ALTER TABLE "contest_weeks" DROP CONSTRAINT "contest_weeks_week_number_check";--> statement-breakpoint
DROP INDEX "contest_weeks_season_week_unique";--> statement-breakpoint
ALTER TABLE "contest_weeks" ADD COLUMN "season_phase" "season_phase" DEFAULT 'regular' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "contest_weeks_season_phase_week_unique" ON "contest_weeks" USING btree ("season","season_phase","week_number");--> statement-breakpoint
ALTER TABLE "contest_weeks" ADD CONSTRAINT "contest_weeks_week_number_check" CHECK (("contest_weeks"."season_phase" = 'preseason' and "contest_weeks"."week_number" between 1 and 4) or ("contest_weeks"."season_phase" = 'regular' and "contest_weeks"."week_number" between 1 and 22));