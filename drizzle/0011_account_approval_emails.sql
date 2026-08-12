ALTER TABLE "email_deliveries" DROP CONSTRAINT "email_deliveries_kind_check";--> statement-breakpoint
ALTER TABLE "email_deliveries" ALTER COLUMN "contest_week_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_kind_check" CHECK ("email_deliveries"."kind" in ('week_published', 'deadline_approaching', 'picks_submitted', 'results_available', 'admin_approval_needed', 'account_approved'));
