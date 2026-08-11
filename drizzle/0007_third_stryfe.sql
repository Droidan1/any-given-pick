CREATE TYPE "public"."privacy_request_status" AS ENUM('pending', 'canceled', 'completed');--> statement-breakpoint
CREATE TABLE "operational_alerts" (
	"fingerprint" varchar(64) PRIMARY KEY NOT NULL,
	"kind" varchar(64) NOT NULL,
	"severity" varchar(16) NOT NULL,
	"message" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_notified_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operational_alerts_severity_check" CHECK ("operational_alerts"."severity" in ('warning', 'error')),
	CONSTRAINT "operational_alerts_count_positive" CHECK ("operational_alerts"."occurrence_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "privacy_request_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"canceled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"scope" varchar(64) NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limit_buckets_count_positive" CHECK ("rate_limit_buckets"."request_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operational_alerts_active_idx" ON "operational_alerts" USING btree ("resolved_at","last_seen_at");--> statement-breakpoint
CREATE INDEX "privacy_requests_status_requested_idx" ON "privacy_requests" USING btree ("status","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_requests_one_pending_per_user" ON "privacy_requests" USING btree ("user_id") WHERE "privacy_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expires_idx" ON "rate_limit_buckets" USING btree ("expires_at");