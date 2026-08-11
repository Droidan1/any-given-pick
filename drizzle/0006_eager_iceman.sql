CREATE TABLE "provider_sync_states" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"provider" varchar(48) NOT NULL,
	"status" varchar(16) DEFAULT 'idle' NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"checked_weeks" integer DEFAULT 0 NOT NULL,
	"checked_games" integer DEFAULT 0 NOT NULL,
	"updated_games" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_sync_states_status_check" CHECK ("provider_sync_states"."status" in ('idle', 'running', 'healthy', 'warning', 'failed')),
	CONSTRAINT "provider_sync_states_counts_nonnegative_check" CHECK ("provider_sync_states"."checked_weeks" >= 0 and "provider_sync_states"."checked_games" >= 0 and "provider_sync_states"."updated_games" >= 0)
);
