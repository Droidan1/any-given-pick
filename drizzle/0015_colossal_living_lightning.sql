CREATE TYPE "public"."commissioner_announcement_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "commissioner_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(80) NOT NULL,
	"body" varchar(500) NOT NULL,
	"status" "commissioner_announcement_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commissioner_announcements_expiry_after_start_check" CHECK ("commissioner_announcements"."expires_at" is null or "commissioner_announcements"."expires_at" > "commissioner_announcements"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "commissioner_announcements" ADD CONSTRAINT "commissioner_announcements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissioner_announcements" ADD CONSTRAINT "commissioner_announcements_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commissioner_announcements_status_starts_idx" ON "commissioner_announcements" USING btree ("status","starts_at");