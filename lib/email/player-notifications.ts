import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { formatWeekName } from "@/lib/admin/schedule-import";
import { getDb } from "@/lib/db";
import {
  contestEntries,
  contestWeeks,
  emailDeliveries,
  emailNotificationPreferences,
  entryVersions,
  games,
  profiles,
  users,
} from "@/lib/db/schema";
import { reportOperationalIssue } from "@/lib/monitoring/operational-alerts";
import { sendEmail } from "./system-email";
import { buildPlayerEmail, type PlayerEmailKind } from "./player-email-template";
import {
  areResultsAvailable,
  DEADLINE_REMINDER_WINDOW_MS,
  emailRetryDelayMs,
} from "./player-notification-policy";

const MAX_ATTEMPTS = 5;
const CLAIM_TIMEOUT_MS = 15 * 60 * 1_000;
const RECENT_PUBLICATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const RECENT_RESULTS_WINDOW_MS = 14 * 24 * 60 * 60 * 1_000;
const PLAYER_EMAIL_KINDS: PlayerEmailKind[] = [
  "week_published",
  "deadline_approaching",
  "picks_submitted",
  "results_available",
];

type DeliveryRow = typeof emailDeliveries.$inferSelect;
type PreferenceRow = typeof emailNotificationPreferences.$inferSelect;

export type PlayerEmailCycleSummary = {
  queued: number;
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
};

function enabledPreference(kind: PlayerEmailKind) {
  switch (kind) {
    case "week_published":
      return emailNotificationPreferences.weekPublished;
    case "deadline_approaching":
      return emailNotificationPreferences.deadlineApproaching;
    case "picks_submitted":
      return emailNotificationPreferences.picksSubmitted;
    case "results_available":
      return emailNotificationPreferences.resultsAvailable;
  }
}

function preferenceIsEnabled(kind: PlayerEmailKind, preference: PreferenceRow | null): boolean {
  if (!preference) return true;
  switch (kind) {
    case "week_published":
      return preference.weekPublished;
    case "deadline_approaching":
      return preference.deadlineApproaching;
    case "picks_submitted":
      return preference.picksSubmitted;
    case "results_available":
      return preference.resultsAvailable;
  }
}

function dedupeKey(kind: PlayerEmailKind, weekId: string, userId: string, versionId?: string) {
  return versionId
    ? `${kind}:${weekId}:${userId}:${versionId}`
    : `${kind}:${weekId}:${userId}`;
}

async function queueWeekDeliveries(kind: Exclude<PlayerEmailKind, "picks_submitted">, weekId: string) {
  const db = getDb();
  const preferenceColumn = enabledPreference(kind);
  const preferenceFilter = or(
    isNull(emailNotificationPreferences.userId),
    eq(preferenceColumn, true),
  );

  let recipients: Array<{ userId: string }>;
  if (kind === "deadline_approaching") {
    recipients = await db
      .select({ userId: users.id })
      .from(users)
      .leftJoin(
        emailNotificationPreferences,
        eq(emailNotificationPreferences.userId, users.id),
      )
      .leftJoin(
        contestEntries,
        and(eq(contestEntries.userId, users.id), eq(contestEntries.contestWeekId, weekId)),
      )
      .where(and(
        eq(users.accountState, "active"),
        preferenceFilter,
        or(isNull(contestEntries.id), eq(contestEntries.currentVersionNumber, 0)),
      ));
  } else if (kind === "results_available") {
    recipients = await db
      .select({ userId: users.id })
      .from(users)
      .innerJoin(
        contestEntries,
        and(eq(contestEntries.userId, users.id), eq(contestEntries.contestWeekId, weekId)),
      )
      .leftJoin(
        emailNotificationPreferences,
        eq(emailNotificationPreferences.userId, users.id),
      )
      .where(and(
        eq(users.accountState, "active"),
        gte(contestEntries.currentVersionNumber, 1),
        preferenceFilter,
      ));
  } else {
    recipients = await db
      .select({ userId: users.id })
      .from(users)
      .leftJoin(
        emailNotificationPreferences,
        eq(emailNotificationPreferences.userId, users.id),
      )
      .where(and(eq(users.accountState, "active"), preferenceFilter));
  }

  if (recipients.length === 0) return 0;
  const inserted = await db
    .insert(emailDeliveries)
    .values(recipients.map(({ userId }) => ({
      userId,
      contestWeekId: weekId,
      kind,
      dedupeKey: dedupeKey(kind, weekId, userId),
    })))
    .onConflictDoNothing({ target: emailDeliveries.dedupeKey })
    .returning({ id: emailDeliveries.id });
  return inserted.length;
}

export async function queueWeekPublishedEmails(weekId: string): Promise<number> {
  return queueWeekDeliveries("week_published", weekId);
}

export async function queueSubmissionConfirmation(input: {
  userId: string;
  weekId: string;
  submissionKey: string;
}): Promise<number> {
  const db = getDb();
  const [version] = await db
    .select({ id: entryVersions.id })
    .from(entryVersions)
    .innerJoin(contestEntries, eq(contestEntries.id, entryVersions.contestEntryId))
    .where(and(
      eq(entryVersions.submissionKey, input.submissionKey),
      eq(contestEntries.userId, input.userId),
      eq(contestEntries.contestWeekId, input.weekId),
    ))
    .limit(1);
  if (!version) return 0;

  const inserted = await db
    .insert(emailDeliveries)
    .values({
      userId: input.userId,
      contestWeekId: input.weekId,
      entryVersionId: version.id,
      kind: "picks_submitted",
      dedupeKey: dedupeKey("picks_submitted", input.weekId, input.userId, version.id),
    })
    .onConflictDoNothing({ target: emailDeliveries.dedupeKey })
    .returning({ id: emailDeliveries.id });
  return inserted.length;
}

async function queueRecentPublishedEmails(now: Date): Promise<number> {
  const weeks = await getDb()
    .select({ id: contestWeeks.id })
    .from(contestWeeks)
    .where(and(
      eq(contestWeeks.status, "published"),
      isNotNull(contestWeeks.publishedAt),
      gte(contestWeeks.publishedAt, new Date(now.getTime() - RECENT_PUBLICATION_WINDOW_MS)),
      gte(contestWeeks.entryDeadline, now),
    ));
  let queued = 0;
  for (const week of weeks) queued += await queueWeekPublishedEmails(week.id);
  return queued;
}

async function queueDeadlineEmails(now: Date): Promise<number> {
  const weeks = await getDb()
    .select({ id: contestWeeks.id })
    .from(contestWeeks)
    .where(and(
      eq(contestWeeks.status, "published"),
      gte(contestWeeks.entryDeadline, now),
      lte(
        contestWeeks.entryDeadline,
        new Date(now.getTime() + DEADLINE_REMINDER_WINDOW_MS),
      ),
    ));
  let queued = 0;
  for (const week of weeks) queued += await queueWeekDeliveries("deadline_approaching", week.id);
  return queued;
}

export async function queueAvailableResultsEmails(now = new Date()): Promise<number> {
  const rows = await getDb()
    .select({
      weekId: contestWeeks.id,
      gameStatus: games.status,
    })
    .from(contestWeeks)
    .innerJoin(games, eq(games.contestWeekId, contestWeeks.id))
    .where(and(
      inArray(contestWeeks.status, ["published", "locked", "final"]),
      gte(contestWeeks.entryDeadline, new Date(now.getTime() - RECENT_RESULTS_WINDOW_MS)),
      lte(contestWeeks.entryDeadline, now),
    ));

  const statusesByWeek = new Map<string, Array<(typeof rows)[number]["gameStatus"]>>();
  for (const row of rows) {
    const statuses = statusesByWeek.get(row.weekId) ?? [];
    statuses.push(row.gameStatus);
    statusesByWeek.set(row.weekId, statuses);
  }

  let queued = 0;
  for (const [weekId, statuses] of statusesByWeek) {
    if (areResultsAvailable(statuses)) {
      queued += await queueWeekDeliveries("results_available", weekId);
    }
  }
  return queued;
}

async function claimDeliveries(limit: number, now: Date): Promise<DeliveryRow[]> {
  return getDb().transaction(async (transaction) => {
    const candidates = await transaction
      .select()
      .from(emailDeliveries)
      .where(and(
        inArray(emailDeliveries.kind, PLAYER_EMAIL_KINDS),
        lt(emailDeliveries.attemptCount, MAX_ATTEMPTS),
        lte(emailDeliveries.nextAttemptAt, now),
        or(
          eq(emailDeliveries.status, "pending"),
          eq(emailDeliveries.status, "failed"),
          and(
            eq(emailDeliveries.status, "processing"),
            lt(emailDeliveries.lastAttemptAt, new Date(now.getTime() - CLAIM_TIMEOUT_MS)),
          ),
        ),
      ))
      .orderBy(asc(emailDeliveries.createdAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (candidates.length === 0) return [];

    const ids = candidates.map((delivery) => delivery.id);
    await transaction
      .update(emailDeliveries)
      .set({
        status: "processing",
        attemptCount: sql`${emailDeliveries.attemptCount} + 1`,
        lastAttemptAt: now,
        updatedAt: now,
      })
      .where(inArray(emailDeliveries.id, ids));
    return candidates.map((delivery) => ({
      ...delivery,
      status: "processing",
      attemptCount: delivery.attemptCount + 1,
      lastAttemptAt: now,
      updatedAt: now,
    }));
  });
}

async function verifiedEmailDirectory(clerkUserIds: string[]) {
  const directory = new Map<string, string>();
  const clerk = await clerkClient();
  for (let index = 0; index < clerkUserIds.length; index += 100) {
    const batch = clerkUserIds.slice(index, index + 100);
    const { data } = await clerk.users.getUserList({ userId: batch, limit: batch.length });
    for (const user of data) {
      const primary = user.emailAddresses.find(
        (email) => email.id === user.primaryEmailAddressId,
      );
      const verified = primary?.verification?.status === "verified"
        ? primary
        : user.emailAddresses.find((email) => email.verification?.status === "verified");
      if (verified) directory.set(user.id, verified.emailAddress);
    }
  }
  return directory;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function processQueuedPlayerEmails(input?: {
  limit?: number;
  now?: Date;
}): Promise<Omit<PlayerEmailCycleSummary, "queued">> {
  const now = input?.now ?? new Date();
  const claimed = await claimDeliveries(Math.min(input?.limit ?? 25, 50), now);
  const summary = { claimed: claimed.length, sent: 0, failed: 0, skipped: 0 };
  if (claimed.length === 0) return summary;

  const userIds = [...new Set(claimed.map((delivery) => delivery.userId))];
  const weekIds = [...new Set(claimed.flatMap(
    (delivery) => delivery.contestWeekId ? [delivery.contestWeekId] : [],
  ))];
  const versionIds = claimed.flatMap((delivery) => delivery.entryVersionId ? [delivery.entryVersionId] : []);
  const [userRows, weekRows, versionRows] = await Promise.all([
    getDb()
      .select({
        id: users.id,
        clerkUserId: users.clerkUserId,
        accountState: users.accountState,
        displayName: profiles.displayName,
        preference: emailNotificationPreferences,
      })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .leftJoin(
        emailNotificationPreferences,
        eq(emailNotificationPreferences.userId, users.id),
      )
      .where(inArray(users.id, userIds)),
    getDb()
      .select()
      .from(contestWeeks)
      .where(inArray(contestWeeks.id, weekIds)),
    versionIds.length > 0
      ? getDb()
          .select({
            id: entryVersions.id,
            versionNumber: entryVersions.versionNumber,
            committedAt: entryVersions.committedAt,
          })
          .from(entryVersions)
          .where(inArray(entryVersions.id, versionIds))
      : Promise.resolve([]),
  ]);

  const usersById = new Map(userRows.map((user) => [user.id, user]));
  const weeksById = new Map(weekRows.map((week) => [week.id, week]));
  const versionsById = new Map(versionRows.map((version) => [version.id, version]));

  let emailsByClerkId: Map<string, string>;
  try {
    emailsByClerkId = await verifiedEmailDirectory(
      userRows.map((user) => user.clerkUserId),
    );
  } catch {
    await Promise.all(claimed.map((delivery) => getDb()
      .update(emailDeliveries)
      .set({
        status: "failed",
        nextAttemptAt: new Date(now.getTime() + emailRetryDelayMs(delivery.attemptCount)),
        lastError: "The verified identity directory was temporarily unavailable.",
        updatedAt: now,
      })
      .where(eq(emailDeliveries.id, delivery.id))));
    await reportOperationalIssue({
      kind: "player_email_delivery",
      identity: "clerk_directory",
      severity: "warning",
      message: "Player reminder emails are waiting because the identity directory was unavailable.",
      context: { failed_count: claimed.length },
      now,
    });
    return { ...summary, failed: claimed.length };
  }

  for (let index = 0; index < claimed.length; index += 1) {
    const delivery = claimed[index];
    const kind = delivery.kind as PlayerEmailKind;
    const user = usersById.get(delivery.userId);
    const week = delivery.contestWeekId
      ? weeksById.get(delivery.contestWeekId)
      : null;
    const recipient = user ? emailsByClerkId.get(user.clerkUserId) : null;
    const version = delivery.entryVersionId
      ? versionsById.get(delivery.entryVersionId)
      : null;

    if (
      !user
      || user.accountState !== "active"
      || !week
      || !preferenceIsEnabled(kind, user.preference)
      || !recipient
      || (kind === "picks_submitted" && !version)
    ) {
      await getDb()
        .update(emailDeliveries)
        .set({
          status: "skipped",
          lastError: !recipient ? "No verified recipient email was available." : "Delivery no longer applies.",
          updatedAt: now,
        })
        .where(eq(emailDeliveries.id, delivery.id));
      summary.skipped += 1;
      continue;
    }

    const content = buildPlayerEmail({
      kind,
      displayName: user.displayName,
      weekLabel: week.label || formatWeekName(week.seasonPhase, week.weekNumber),
      entryDeadline: week.entryDeadline,
      versionNumber: version?.versionNumber,
      committedAt: version?.committedAt,
    });
    const result = await sendEmail({
      to: recipient,
      subject: content.subject,
      text: content.text,
      html: content.html,
      idempotencyKey: delivery.dedupeKey,
    });

    if (result.sent) {
      await getDb()
        .update(emailDeliveries)
        .set({
          status: "sent",
          sentAt: now,
          providerMessageId: result.id,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(emailDeliveries.id, delivery.id));
      summary.sent += 1;
    } else {
      await getDb()
        .update(emailDeliveries)
        .set({
          status: "failed",
          nextAttemptAt: new Date(now.getTime() + emailRetryDelayMs(delivery.attemptCount)),
          lastError: result.reason === "not_configured"
            ? "Email delivery is not configured."
            : "The email provider rejected or could not deliver the request.",
          updatedAt: now,
        })
        .where(eq(emailDeliveries.id, delivery.id));
      summary.failed += 1;
    }

    if (index < claimed.length - 1) await wait(450);
  }

  if (summary.failed > 0) {
    await reportOperationalIssue({
      kind: "player_email_delivery",
      identity: "resend",
      severity: "warning",
      message: "One or more player reminder emails could not be delivered.",
      context: { failed_count: summary.failed, claimed_count: summary.claimed },
      now,
    });
  }
  return summary;
}

export async function runPlayerEmailCycle(now = new Date()): Promise<PlayerEmailCycleSummary> {
  const [published, deadline, results] = await Promise.all([
    queueRecentPublishedEmails(now),
    queueDeadlineEmails(now),
    queueAvailableResultsEmails(now),
  ]);
  const processed = await processQueuedPlayerEmails({ now });
  return { queued: published + deadline + results, ...processed };
}

export async function queueAndProcessWeekPublishedEmails(weekId: string) {
  const queued = await queueWeekPublishedEmails(weekId);
  const processed = await processQueuedPlayerEmails();
  return { queued, ...processed };
}

export async function queueAndProcessSubmissionConfirmation(input: {
  userId: string;
  weekId: string;
  submissionKey: string;
}) {
  const queued = await queueSubmissionConfirmation(input);
  const processed = await processQueuedPlayerEmails();
  return { queued, ...processed };
}
