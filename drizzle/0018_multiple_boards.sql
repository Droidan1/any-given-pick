CREATE TABLE "board_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"multiple_boards_enabled" boolean DEFAULT false NOT NULL,
	"max_boards" integer DEFAULT 4 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_settings_singleton" CHECK ("board_settings"."id" = 1),
	CONSTRAINT "board_settings_limit" CHECK ("board_settings"."max_boards" >= 2)
);
--> statement-breakpoint
DROP INDEX "contest_entries_week_user_unique";--> statement-breakpoint
ALTER TABLE "contest_entries" ADD COLUMN "board_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "contest_entries" ADD COLUMN "board_name" varchar(40) DEFAULT 'Board 1' NOT NULL;--> statement-breakpoint
ALTER TABLE "contest_entries" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "contest_entries_week_user_board_unique" ON "contest_entries" USING btree ("contest_week_id","user_id","board_number");--> statement-breakpoint
ALTER TABLE "contest_entries" ADD CONSTRAINT "contest_entries_board_number_positive" CHECK ("contest_entries"."board_number" > 0);
--> statement-breakpoint
INSERT INTO "board_settings" ("id", "multiple_boards_enabled", "max_boards") VALUES (1, false, 4);
