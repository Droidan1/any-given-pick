ALTER TABLE "games" ADD COLUMN "away_moneyline" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "home_moneyline" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "over_under" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "odds_provider" varchar(48);--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "odds_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_away_moneyline_check" CHECK ("games"."away_moneyline" is null or "games"."away_moneyline" between -100000 and -100 or "games"."away_moneyline" between 100 and 100000);--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_home_moneyline_check" CHECK ("games"."home_moneyline" is null or "games"."home_moneyline" between -100000 and -100 or "games"."home_moneyline" between 100 and 100000);--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_over_under_check" CHECK ("games"."over_under" is null or "games"."over_under" between 0 and 200);
