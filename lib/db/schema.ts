import {
  boolean,
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

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: varchar("clerk_user_id", { length: 128 }).notNull(),
    accountState: accountStateEnum("account_state").notNull().default("active"),
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
