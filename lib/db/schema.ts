import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const accountStateEnum = pgEnum("account_state", [
  "active",
  "read_only",
  "suspended",
  "banned",
  "deleted_anonymized",
]);

export const locationResultEnum = pgEnum("location_result", [
  "in_state",
  "outside_state",
  "denied",
  "unavailable",
  "indeterminate",
]);

export const eligibilityResultEnum = pgEnum("eligibility_result", [
  "eligible",
  "read_only",
]);

export const contestWeekStatusEnum = pgEnum("contest_week_status", [
  "draft",
  "published",
  "locked",
  "final",
]);

export const seasonPhaseEnum = pgEnum("season_phase", ["preseason", "regular"]);

export const gameStatusEnum = pgEnum("game_status", [
  "scheduled",
  "in_progress",
  "final",
  "postponed",
  "canceled",
]);

export const entryStatusEnum = pgEnum("entry_status", [
  "draft",
  "submitted",
  "locked",
  "scored",
  "disqualified",
]);

export const privacyRequestStatusEnum = pgEnum("privacy_request_status", [
  "pending",
  "canceled",
  "completed",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: varchar("clerk_user_id", { length: 128 }).notNull(),
    accountState: accountStateEnum("account_state").notNull().default("read_only"),
    stateReason: text("state_reason"),
    stateChangedAt: timestamp("state_changed_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("users_clerk_user_id_unique").on(table.clerkUserId)],
);

export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 32 }).notNull(),
    normalizedDisplayName: varchar("normalized_display_name", { length: 32 }).notNull(),
    birthDate: date("birth_date", { mode: "string" }).notNull(),
    ageEligible: boolean("age_eligible").notNull(),
    ageCheckedAt: timestamp("age_checked_at", { withTimezone: true }).notNull(),
    displayNameChangedAt: timestamp("display_name_changed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("profiles_normalized_display_name_unique").on(table.normalizedDisplayName),
  ],
);

export const emailNotificationPreferences = pgTable(
  "email_notification_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    weekPublished: boolean("week_published").notNull().default(true),
    deadlineApproaching: boolean("deadline_approaching").notNull().default(true),
    picksSubmitted: boolean("picks_submitted").notNull().default(true),
    resultsAvailable: boolean("results_available").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const displayNameHistory = pgTable(
  "display_name_history",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    displayName: varchar("display_name", { length: 32 }).notNull(),
    normalizedDisplayName: varchar("normalized_display_name", { length: 32 }).notNull(),
    reason: varchar("reason", { length: 64 }).notNull().default("user_update"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("display_name_history_user_changed_idx").on(table.userId, table.changedAt)],
);

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 48 }).notNull(),
    providerUserId: varchar("provider_user_id", { length: 160 }).notNull(),
    identifierHash: varchar("identifier_hash", { length: 64 }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_identities_provider_subject_unique").on(
      table.provider,
      table.providerUserId,
    ),
    index("auth_identities_user_idx").on(table.userId),
  ],
);

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 48 }).notNull().unique(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

export const eligibilityChecks = pgTable(
  "eligibility_checks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ageResult: boolean("age_result").notNull(),
    locationResult: locationResultEnum("location_result").notNull(),
    overallResult: eligibilityResultEnum("overall_result").notNull(),
    reasonCode: varchar("reason_code", { length: 64 }).notNull(),
    accuracyMeters: integer("accuracy_meters"),
    method: varchar("method", { length: 96 }).notNull(),
    policyVersion: varchar("policy_version", { length: 32 }).notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("eligibility_checks_user_checked_idx").on(table.userId, table.checkedAt)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 96 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 160 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_events_target_created_idx").on(table.targetUserId, table.createdAt)],
);

export const providerSyncStates = pgTable(
  "provider_sync_states",
  {
    key: varchar("key", { length: 64 }).primaryKey(),
    provider: varchar("provider", { length: 48 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("idle"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    checkedWeeks: integer("checked_weeks").notNull().default(0),
    checkedGames: integer("checked_games").notNull().default(0),
    updatedGames: integer("updated_games").notNull().default(0),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "provider_sync_states_status_check",
      sql`${table.status} in ('idle', 'running', 'healthy', 'warning', 'failed')`,
    ),
    check(
      "provider_sync_states_counts_nonnegative_check",
      sql`${table.checkedWeeks} >= 0 and ${table.checkedGames} >= 0 and ${table.updatedGames} >= 0`,
    ),
  ],
);

export const privacyRequests = pgTable(
  "privacy_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: privacyRequestStatusEnum("status").notNull().default("pending"),
    previousAccountState: accountStateEnum("previous_account_state").notNull(),
    previousStateReason: text("previous_state_reason"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    processingAt: timestamp("processing_at", { withTimezone: true }),
    processingByUserId: uuid("processing_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByUserId: uuid("completed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("privacy_requests_status_requested_idx").on(table.status, table.requestedAt),
    uniqueIndex("privacy_requests_one_pending_per_user")
      .on(table.userId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: varchar("key", { length: 64 }).primaryKey(),
    scope: varchar("scope", { length: 64 }).notNull(),
    requestCount: integer("request_count").notNull().default(1),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rate_limit_buckets_expires_idx").on(table.expiresAt),
    check("rate_limit_buckets_count_positive", sql`${table.requestCount} > 0`),
  ],
);

export const operationalAlerts = pgTable(
  "operational_alerts",
  {
    fingerprint: varchar("fingerprint", { length: 64 }).primaryKey(),
    kind: varchar("kind", { length: 64 }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull(),
    message: text("message").notNull(),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("operational_alerts_active_idx").on(table.resolvedAt, table.lastSeenAt),
    check("operational_alerts_severity_check", sql`${table.severity} in ('warning', 'error')`),
    check("operational_alerts_count_positive", sql`${table.occurrenceCount} > 0`),
  ],
);

export const contestWeeks = pgTable(
  "contest_weeks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    season: integer("season").notNull(),
    seasonPhase: seasonPhaseEnum("season_phase").notNull().default("regular"),
    weekNumber: integer("week_number").notNull(),
    label: varchar("label", { length: 80 }),
    status: contestWeekStatusEnum("status").notNull().default("draft"),
    entryDeadline: timestamp("entry_deadline", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("contest_weeks_season_phase_week_unique").on(
      table.season,
      table.seasonPhase,
      table.weekNumber,
    ),
    index("contest_weeks_status_deadline_idx").on(table.status, table.entryDeadline),
    check(
      "contest_weeks_week_number_check",
      sql`(${table.seasonPhase} = 'preseason' and ${table.weekNumber} between 1 and 4) or (${table.seasonPhase} = 'regular' and ${table.weekNumber} between 1 and 22)`,
    ),
    check("contest_weeks_season_check", sql`${table.season} between 2020 and 2100`),
  ],
);

export const games = pgTable(
  "games",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contestWeekId: uuid("contest_week_id")
      .notNull()
      .references(() => contestWeeks.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 48 }).notNull().default("manual"),
    providerGameKey: varchar("provider_game_key", { length: 160 }),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
    awayTeamCode: varchar("away_team_code", { length: 5 }).notNull(),
    awayTeamName: varchar("away_team_name", { length: 80 }).notNull(),
    homeTeamCode: varchar("home_team_code", { length: 5 }).notNull(),
    homeTeamName: varchar("home_team_name", { length: 80 }).notNull(),
    status: gameStatusEnum("status").notNull().default("scheduled"),
    awayScore: integer("away_score"),
    homeScore: integer("home_score"),
    isMondayTiebreaker: boolean("is_monday_tiebreaker").notNull().default(false),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("games_week_kickoff_idx").on(table.contestWeekId, table.kickoffAt),
    uniqueIndex("games_week_provider_key_unique").on(
      table.contestWeekId,
      table.provider,
      table.providerGameKey,
    ),
    uniqueIndex("games_week_matchup_kickoff_unique").on(
      table.contestWeekId,
      table.awayTeamCode,
      table.homeTeamCode,
      table.kickoffAt,
    ),
    uniqueIndex("games_one_monday_tiebreaker_per_week")
      .on(table.contestWeekId)
      .where(sql`${table.isMondayTiebreaker} = true`),
    check(
      "games_scores_nonnegative_check",
      sql`(${table.awayScore} is null or ${table.awayScore} >= 0) and (${table.homeScore} is null or ${table.homeScore} >= 0)`,
    ),
    check("games_distinct_teams_check", sql`${table.awayTeamCode} <> ${table.homeTeamCode}`),
  ],
);

export const contestEntries = pgTable(
  "contest_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contestWeekId: uuid("contest_week_id")
      .notNull()
      .references(() => contestWeeks.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: entryStatusEnum("status").notNull().default("draft"),
    draftPicks: jsonb("draft_picks").$type<Record<string, string>>().notNull().default({}),
    draftMondayPrediction: integer("draft_monday_prediction"),
    currentVersionNumber: integer("current_version_number").notNull().default(0),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("contest_entries_week_user_unique").on(table.contestWeekId, table.userId),
    index("contest_entries_week_status_idx").on(table.contestWeekId, table.status),
    check(
      "contest_entries_monday_prediction_nonnegative_check",
      sql`${table.draftMondayPrediction} is null or ${table.draftMondayPrediction} >= 0`,
    ),
    check(
      "contest_entries_version_nonnegative_check",
      sql`${table.currentVersionNumber} >= 0`,
    ),
  ],
);

export const entryVersions = pgTable(
  "entry_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contestEntryId: uuid("contest_entry_id")
      .notNull()
      .references(() => contestEntries.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    submissionKey: uuid("submission_key").notNull(),
    action: varchar("action", { length: 16 }).notNull(),
    mondayPrediction: integer("monday_prediction").notNull(),
    eligibilitySnapshot: jsonb("eligibility_snapshot")
      .$type<{
        reason: string;
        locationResult: string | null;
        locationCheckedAt: string | null;
      }>()
      .notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("entry_versions_entry_version_unique").on(
      table.contestEntryId,
      table.versionNumber,
    ),
    uniqueIndex("entry_versions_submission_key_unique").on(table.submissionKey),
    check("entry_versions_version_positive_check", sql`${table.versionNumber} > 0`),
    check("entry_versions_monday_prediction_nonnegative_check", sql`${table.mondayPrediction} >= 0`),
    check("entry_versions_action_check", sql`${table.action} in ('submit', 'edit')`),
  ],
);

export const entryVersionPicks = pgTable(
  "entry_version_picks",
  {
    entryVersionId: uuid("entry_version_id")
      .notNull()
      .references(() => entryVersions.id, { onDelete: "restrict" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "restrict" }),
    selectedTeamCode: varchar("selected_team_code", { length: 5 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.entryVersionId, table.gameId] }),
    index("entry_version_picks_game_idx").on(table.gameId),
  ],
);

export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contestWeekId: uuid("contest_week_id")
      .notNull()
      .references(() => contestWeeks.id, { onDelete: "cascade" }),
    entryVersionId: uuid("entry_version_id").references(() => entryVersions.id, {
      onDelete: "set null",
    }),
    kind: varchar("kind", { length: 48 }).notNull(),
    dedupeKey: varchar("dedupe_key", { length: 200 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    providerMessageId: varchar("provider_message_id", { length: 160 }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("email_deliveries_dedupe_key_unique").on(table.dedupeKey),
    index("email_deliveries_status_attempt_idx").on(table.status, table.nextAttemptAt),
    index("email_deliveries_user_kind_idx").on(table.userId, table.kind),
    check(
      "email_deliveries_kind_check",
      sql`${table.kind} in ('week_published', 'deadline_approaching', 'picks_submitted', 'results_available')`,
    ),
    check(
      "email_deliveries_status_check",
      sql`${table.status} in ('pending', 'processing', 'sent', 'failed', 'skipped')`,
    ),
    check("email_deliveries_attempt_count_nonnegative", sql`${table.attemptCount} >= 0`),
  ],
);
