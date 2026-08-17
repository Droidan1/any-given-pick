WITH ranked_published_weeks AS (
	SELECT
		"id",
		row_number() OVER (
			ORDER BY "published_at" DESC NULLS LAST, "updated_at" DESC, "id" DESC
		) AS "published_rank"
	FROM "contest_weeks"
	WHERE "status" = 'published'
)
UPDATE "contest_weeks"
SET "status" = 'locked', "updated_at" = now()
WHERE "id" IN (
	SELECT "id"
	FROM ranked_published_weeks
	WHERE "published_rank" > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contest_weeks_one_published_unique" ON "contest_weeks" USING btree ("status") WHERE "contest_weeks"."status" = 'published';
