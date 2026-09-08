ALTER TABLE "privacy_requests" ADD COLUMN "previous_account_state" "account_state";--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD COLUMN "previous_state_reason" text;--> statement-breakpoint
UPDATE "privacy_requests"
SET
	"previous_account_state" = CASE
		WHEN "privacy_requests"."status" = 'pending' THEN 'active'::"account_state"
		ELSE "users"."account_state"
	END,
	"previous_state_reason" = CASE
		WHEN "privacy_requests"."status" = 'pending' THEN NULL
		ELSE "users"."state_reason"
	END
FROM "users"
WHERE "privacy_requests"."user_id" = "users"."id";--> statement-breakpoint
ALTER TABLE "privacy_requests" ALTER COLUMN "previous_account_state" SET NOT NULL;
