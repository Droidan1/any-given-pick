import "server-only";

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
import { sendNotification, WebPushError } from "web-push";
import { formatWeekName } from "@/lib/admin/schedule-import";
import { getDb } from "@/lib/db";
import {
  contestEntries,
  contestWeeks,
  entryVersions,
  games,
  pushDeliveries,
  pushSubscriptions,
  users,
} from "@/lib/db/schema";
import {
  areResultsAvailable,
  DEADLINE_REMINDER_WINDOW_MS,
  emailRetryDelayMs,
} from "@/lib/email/player-notification-policy";
import { reportOperationalIssue } from "@/lib/monitoring/operational-alerts";
import {
  buildPlayerPush,
  buildWebPushPayload,
  type PlayerPushKind,
} from "./player-push-template";

const MAX_ATTEMPTS = 5;
const CLAIM_TIMEOUT_MS = 15 * 60 * 1_000;
const RECENT_PUBLICATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const RECENT_RESULTS_WINDOW_MS = 14 * 24 * 60 * 60 * 1_000;
const PLAYER_PUSH_KINDS: PlayerPushKind[] = [
  "week_published",
  "deadline_approaching",
  "picks_submitted",
  "results_available",
];

type DeliveryRow = typeof pushDeliveries.$inferSelect;

export type PlayerPushCycleSummary = {
  queued: number;
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
};

function deliveryDedupeKey(input: {
  kind: PlayerPushKind;
  weekId: string;
  subscriptionId: string;
  versionId?: string;
}) {
  const suffix = input.versionId ? `:${input.versionId}` : "";
  return `${input.kind}:${input.weekId}:${input.subscriptionId}${suffix}`;
}

async function queueWeekDeliveries(
  kind: Exclude<PlayerPushKind, "picks_submitted">,
  weekId: string,
) {
  const db = getDb();
  let recipients: Array<{ userId: string; subscriptionId: string }>;

  if (kind === "deadline_approaching") {
    recipients = await db
      .select({ userId: users.id, subscriptionId: pushSubscriptions.id })
      .from(pushSubscriptions)
      .innerJoin(users, eq(users.id, pushSubscriptions.userId))
      .leftJoin(
        contestEntries,
        and(eq(contestEntries.userId, users.id), eq(contestEntries.contestWeekId, weekId)),
      )
      .where(and(
        eq(users.accountState, "active"),
        or(isNull(contestEntries.id), eq(contestEntries.currentVersionNumber, 0)),
      ));
  } else if (kind === "results_available") {
    recipients = await db
      .select({ userId: users.id, subscriptionId: pushSubscriptions.id })
      .from(pushSubscriptions)
      .innerJoin(users, eq(users.id, pushSubscriptions.userId))
      .innerJoin(
        contestEntries,
        and(eq(contestEntries.userId, users.id), eq(contestEntries.contestWeekId, weekId)),
      )
      .where(and(
        eq(users.accountState, "active"),
        gte(contestEntries.currentVersionNumber, 1),
      ));
  } else {
    recipients = await db
      .select({ userId: users.id, subscriptionId: pushSubscriptions.id })
      .from(pushSubscriptions)
      .innerJoin(users, eq(users.id, pushSubscriptions.userId))
      .where(eq(users.accountState, "active"));
  }

  if (recipients.length === 0) return 0;
  const inserted = await db
    .insert(pushDeliveries)
    .values(recipients.map((recipient) => ({
      userId: recipient.userId,
      subscriptionId: recipient.subscriptionId,
      contestWeekId: weekId,
      kind,
      dedupeKey: deliveryDedupeKey({ kind, weekId, subscriptionId: recipient.subscriptionId }),
    })))
    .onConflictDoNothing({ target: pushDeliveries.dedupeKey })
    .returning({ id: pushDeliveries.id });
  return inserted.length;
}

export async function queueWeekPublishedPushes(weekId: string): Promise<number> {
  return queueWeekDeliveries("week_published", weekId);
}

export async function queueSubmissionPush(input: {
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

  const subscriptions = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, input.userId));
  if (subscriptions.length === 0) return 0;

  const inserted = await db
    .insert(pushDeliveries)
    .values(subscriptions.map((subscription) => ({
      subscriptionId: subscription.id,
      userId: input.userId,
      contestWeekId: input.weekId,
      entryVersionId: version.id,
      kind: "picks_submitted",
      dedupeKey: deliveryDedupeKey({
        kind: "picks_submitted",
        weekId: input.weekId,
        subscriptionId: subscription.id,
        versionId: version.id,
      }),
    })))
    .onConflictDoNothing({ target: pushDeliveries.dedupeKey })
    .returning({ id: pushDeliveries.id });
  return inserted.length;
}

async function queueRecentPublishedPushes(now: Date): Promise<number> {
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
  for (const week of weeks) queued += await queueWeekPublishedPushes(week.id);
  return queued;
}

async function queueDeadlinePushes(now: Date): Promise<number> {
  const weeks = await getDb()
    .select({ id: contestWeeks.id })
    .from(contestWeeks)
    .where(and(
      eq(contestWeeks.status, "published"),
      gte(contestWeeks.entryDeadline, now),
      lte(contestWeeks.entryDeadline, new Date(now.getTime() + DEADLINE_REMINDER_WINDOW_MS)),
    ));
  let queued = 0;
  for (const week of weeks) queued += await queueWeekDeliveries("deadline_approaching", week.id);
  return queued;
}

export async function queueAvailableResultsPushes(now = new Date()): Promise<number> {
  const rows = await getDb()
    .select({ weekId: contestWeeks.id, gameStatus: games.status })
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
    if (areResultsAvailable(statuses)) queued += await queueWeekDeliveries("results_available", weekId);
  }
  return queued;
}

async function claimDeliveries(limit: number, now: Date): Promise<DeliveryRow[]> {
  return getDb().transaction(async (transaction) => {
    const candidates = await transaction
      .select()
      .from(pushDeliveries)
      .where(and(
        inArray(pushDeliveries.kind, PLAYER_PUSH_KINDS),
        lt(pushDeliveries.attemptCount, MAX_ATTEMPTS),
        lte(pushDeliveries.nextAttemptAt, now),
        or(
          eq(pushDeliveries.status, "pending"),
          eq(pushDeliveries.status, "failed"),
          and(
            eq(pushDeliveries.status, "processing"),
            lt(pushDeliveries.lastAttemptAt, new Date(now.getTime() - CLAIM_TIMEOUT_MS)),
          ),
        ),
      ))
      .orderBy(asc(pushDeliveries.createdAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (candidates.length === 0) return [];

    const ids = candidates.map((delivery) => delivery.id);
    await transaction
      .update(pushDeliveries)
      .set({
        status: "processing",
        attemptCount: sql`${pushDeliveries.attemptCount} + 1`,
        lastAttemptAt: now,
        updatedAt: now,
      })
      .where(inArray(pushDeliveries.id, ids));
    return candidates.map((delivery) => ({
      ...delivery,
      status: "processing",
      attemptCount: delivery.attemptCount + 1,
      lastAttemptAt: now,
      updatedAt: now,
    }));
  });
}

function vapidConfiguration() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:brian@droidan1.dev";
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null;
}

export async function processQueuedPlayerPushes(input?: {
  limit?: number;
  now?: Date;
}): Promise<Omit<PlayerPushCycleSummary, "queued">> {
  const now = input?.now ?? new Date();
  const claimed = await claimDeliveries(Math.min(input?.limit ?? 50, 100), now);
  const summary = { claimed: claimed.length, sent: 0, failed: 0, skipped: 0 };
  if (claimed.length === 0) return summary;

  const subscriptionIds = [...new Set(claimed.map((delivery) => delivery.subscriptionId))];
  const userIds = [...new Set(claimed.map((delivery) => delivery.userId))];
  const weekIds = [...new Set(claimed.flatMap(
    (delivery) => delivery.contestWeekId ? [delivery.contestWeekId] : [],
  ))];
  const versionIds = [...new Set(claimed.flatMap(
    (delivery) => delivery.entryVersionId ? [delivery.entryVersionId] : [],
  ))];
  const [subscriptionRows, userRows, weekRows, versionRows] = await Promise.all([
    getDb().select().from(pushSubscriptions).where(inArray(pushSubscriptions.id, subscriptionIds)),
    getDb().select({ id: users.id, accountState: users.accountState }).from(users).where(inArray(users.id, userIds)),
    getDb().select().from(contestWeeks).where(inArray(contestWeeks.id, weekIds)),
    versionIds.length > 0
      ? getDb().select({ id: entryVersions.id, versionNumber: entryVersions.versionNumber }).from(entryVersions).where(inArray(entryVersions.id, versionIds))
      : Promise.resolve([]),
  ]);
  const subscriptionsById = new Map(subscriptionRows.map((row) => [row.id, row]));
  const usersById = new Map(userRows.map((row) => [row.id, row]));
  const weeksById = new Map(weekRows.map((row) => [row.id, row]));
  const versionsById = new Map(versionRows.map((row) => [row.id, row]));
  const vapid = vapidConfiguration();

  for (const delivery of claimed) {
    const subscription = subscriptionsById.get(delivery.subscriptionId);
    const user = usersById.get(delivery.userId);
    const week = delivery.contestWeekId ? weeksById.get(delivery.contestWeekId) : null;
    const version = delivery.entryVersionId ? versionsById.get(delivery.entryVersionId) : null;
    const kind = delivery.kind as PlayerPushKind;

    if (
      !subscription
      || subscription.userId !== delivery.userId
      || !user
      || user.accountState !== "active"
      || !week
      || !vapid
      || (kind === "picks_submitted" && !version)
    ) {
      await getDb().update(pushDeliveries).set({
        status: vapid ? "skipped" : "failed",
        nextAttemptAt: new Date(now.getTime() + emailRetryDelayMs(delivery.attemptCount)),
        lastError: vapid ? "Delivery no longer applies." : "Web Push delivery is not configured.",
        updatedAt: now,
      }).where(eq(pushDeliveries.id, delivery.id));
      if (vapid) summary.skipped += 1;
      else summary.failed += 1;
      continue;
    }

    const content = buildPlayerPush({
      kind,
      weekId: week.id,
      weekLabel: week.label || formatWeekName(week.seasonPhase, week.weekNumber),
      entryDeadline: week.entryDeadline,
      versionNumber: version?.versionNumber,
    });

    try {
      const response = await sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(buildWebPushPayload(content)),
        {
          vapidDetails: vapid,
          TTL: kind === "deadline_approaching" ? 24 * 60 * 60 : 7 * 24 * 60 * 60,
          urgency: content.urgency,
        },
      );
      await getDb().update(pushDeliveries).set({
        status: "sent",
        sentAt: now,
        providerMessageId: String(response.statusCode),
        lastError: null,
        updatedAt: now,
      }).where(eq(pushDeliveries.id, delivery.id));
      summary.sent += 1;
    } catch (error) {
      if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
        await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
        summary.skipped += 1;
        continue;
      }
      await getDb().update(pushDeliveries).set({
        status: "failed",
        nextAttemptAt: new Date(now.getTime() + emailRetryDelayMs(delivery.attemptCount)),
        lastError: "The browser push service rejected or could not deliver the request.",
        updatedAt: now,
      }).where(eq(pushDeliveries.id, delivery.id));
      summary.failed += 1;
    }
  }

  if (summary.failed > 0) {
    await reportOperationalIssue({
      kind: "player_push_delivery",
      identity: "web_push",
      severity: "warning",
      message: "One or more player push notifications could not be delivered.",
      context: { failed_count: summary.failed, claimed_count: summary.claimed },
      now,
    });
  }
  return summary;
}

export async function runPlayerPushCycle(now = new Date()): Promise<PlayerPushCycleSummary> {
  const [published, deadline, results] = await Promise.all([
    queueRecentPublishedPushes(now),
    queueDeadlinePushes(now),
    queueAvailableResultsPushes(now),
  ]);
  const processed = await processQueuedPlayerPushes({ now });
  return { queued: published + deadline + results, ...processed };
}

export async function queueAndProcessWeekPublishedPushes(weekId: string) {
  const queued = await queueWeekPublishedPushes(weekId);
  const processed = await processQueuedPlayerPushes();
  return { queued, ...processed };
}

export async function queueAndProcessSubmissionPush(input: {
  userId: string;
  weekId: string;
  submissionKey: string;
}) {
  const queued = await queueSubmissionPush(input);
  const processed = await processQueuedPlayerPushes();
  return { queued, ...processed };
}
