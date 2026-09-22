import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { and, asc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contestEntries, contestWeeks, entryVersions, games, nativePushDeliveries as deliveries, nativePushDevices as devices, users } from "@/lib/db/schema";
import { formatWeekName } from "@/lib/admin/schedule-import";
import { areResultsAvailable, DEADLINE_REMINDER_WINDOW_MS, emailRetryDelayMs } from "@/lib/email/player-notification-policy";
import { reportOperationalIssue } from "@/lib/monitoring/operational-alerts";
import { buildPlayerPush, type PlayerPushKind } from "@/lib/push/player-push-template";
import { APNsDeliveryError, apnsConfigured, nativePushEnabled, sendNativePush, type APNsEnvironment } from "./apns";
import { nativeDeliveryApplies, nativePushPayload, preferenceForKind } from "./policy";

const emptySummary = () => ({ queued: 0, claimed: 0, sent: 0, failed: 0, skipped: 0 });

async function queueEvent(kind: PlayerPushKind, weekId: string, input?: { userId: string; versionId: string; occurredAt: Date }) {
  const db = getDb();
  const [week] = await db.select().from(contestWeeks).where(eq(contestWeeks.id, weekId)).limit(1);
  if (!week || week.status === "draft") return 0;
  const recipients = await db.select({ device: devices, entry: contestEntries })
    .from(devices).innerJoin(users, eq(users.id, devices.userId))
    .leftJoin(contestEntries, and(eq(contestEntries.userId, devices.userId), eq(contestEntries.contestWeekId, weekId)))
    .where(and(eq(devices.enabled, true), eq(devices[preferenceForKind[kind]], true), eq(users.accountState, "active"),
      input ? eq(devices.userId, input.userId) : undefined));
  const applicable = recipients.filter(({ device, entry }) => {
    if (!apnsConfigured(device.environment as APNsEnvironment)) return false;
    if (kind === "deadline_approaching") return !entry?.currentVersionNumber;
    // Don't replay old events onto a newly enrolled phone.
    if (kind === "week_published") return week.publishedAt && device.createdAt <= week.publishedAt;
    if (kind === "results_available") return Boolean(entry?.currentVersionNumber) && device.createdAt <= week.entryDeadline;
    return input && device.createdAt <= input.occurredAt;
  });
  if (!applicable.length) return 0;
  const inserted = await db.insert(deliveries).values(applicable.map(({ device }) => ({
    deviceId: device.id, userId: device.userId, contestWeekId: weekId, kind,
    entryVersionId: input?.versionId,
    dedupeKey: `${kind}:${weekId}:${device.id}:${input?.versionId ?? ""}`,
  }))).onConflictDoNothing({ target: deliveries.dedupeKey }).returning({ id: deliveries.id });
  return inserted.length;
}

export async function queueNativeSubmission(input: { userId: string; weekId: string; submissionKey: string }) {
  if (!nativePushEnabled()) return emptySummary();
  const [version] = await getDb().select({ id: entryVersions.id, committedAt: entryVersions.committedAt }).from(entryVersions)
    .innerJoin(contestEntries, eq(contestEntries.id, entryVersions.contestEntryId))
    .where(and(eq(entryVersions.submissionKey, input.submissionKey), eq(contestEntries.userId, input.userId),
      eq(contestEntries.contestWeekId, input.weekId))).limit(1);
  const queued = version ? await queueEvent("picks_submitted", input.weekId, { userId: input.userId, versionId: version.id, occurredAt: version.committedAt }) : 0;
  return { queued, ...await processNativePushes() };
}

export async function queueNativeWeekPublished(weekId: string) {
  if (!nativePushEnabled()) return emptySummary();
  return { queued: await queueEvent("week_published", weekId), ...await processNativePushes() };
}

export async function queueAvailableNativeResults(now = new Date()): Promise<number> {
  if (!nativePushEnabled()) return 0;
  const rows = await getDb().select({ weekId: contestWeeks.id, gameStatus: games.status })
    .from(contestWeeks).innerJoin(games, eq(games.contestWeekId, contestWeeks.id))
    .where(and(
      inArray(contestWeeks.status, ["published", "locked", "final"]),
      gte(contestWeeks.entryDeadline, new Date(now.getTime() - 14 * 86400_000)),
      lte(contestWeeks.entryDeadline, now),
    ));
  const statusesByWeek = new Map<string, Array<(typeof rows)[number]["gameStatus"]>>();
  for (const { weekId, gameStatus } of rows) {
    const statuses = statusesByWeek.get(weekId) ?? [];
    statuses.push(gameStatus);
    statusesByWeek.set(weekId, statuses);
  }
  let queued = 0;
  for (const [weekId, statuses] of statusesByWeek) {
    if (areResultsAvailable(statuses)) queued += await queueEvent("results_available", weekId);
  }
  return queued;
}

export async function runNativePushCycle(now = new Date()) {
  if (!nativePushEnabled()) return emptySummary();
  const db = getDb();
  const weeks = await db.select().from(contestWeeks).where(and(
    inArray(contestWeeks.status, ["published", "locked", "final"]),
    gte(contestWeeks.entryDeadline, new Date(now.getTime() - 14 * 86400_000)),
  ));
  let queued = 0;
  for (const week of weeks) {
    if (week.status === "published" && week.entryDeadline > now) {
      if (week.publishedAt && now.getTime() - week.publishedAt.getTime() <= 7 * 86400_000) queued += await queueEvent("week_published", week.id);
      if (week.entryDeadline.getTime() - now.getTime() <= DEADLINE_REMINDER_WINDOW_MS) queued += await queueEvent("deadline_approaching", week.id);
    }
  }
  queued += await queueAvailableNativeResults(now);
  // Recover submissions even if an after-response task was interrupted.
  const versions = await db.select({ version: entryVersions, entry: contestEntries }).from(entryVersions)
    .innerJoin(contestEntries, eq(contestEntries.id, entryVersions.contestEntryId))
    .where(gte(entryVersions.committedAt, new Date(now.getTime() - 86400_000)));
  for (const { version, entry } of versions) {
    queued += await queueEvent("picks_submitted", entry.contestWeekId, { userId: entry.userId, versionId: version.id, occurredAt: version.committedAt });
  }
  return { queued, ...await processNativePushes(now) };
}

export async function processNativePushes(now = new Date()) {
  const summary = { claimed: 0, sent: 0, failed: 0, skipped: 0 };
  const environments = (["sandbox", "production"] as const).filter(apnsConfigured);
  if (!environments.length) return summary;
  const db = getDb();
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx.select({ delivery: deliveries }).from(deliveries)
      .innerJoin(devices, eq(devices.id, deliveries.deviceId))
      .where(and(inArray(devices.environment, environments), lt(deliveries.attemptCount, 5), lte(deliveries.nextAttemptAt, now),
        or(inArray(deliveries.status, ["pending", "failed"]), and(eq(deliveries.status, "processing"),
          lt(deliveries.lastAttemptAt, new Date(now.getTime() - 15 * 60_000))))))
      .orderBy(asc(deliveries.createdAt)).limit(20).for("update", { of: deliveries, skipLocked: true });
    if (!rows.length) return [];
    await tx.update(deliveries).set({ status: "processing", attemptCount: sql`${deliveries.attemptCount} + 1`, lastAttemptAt: now, updatedAt: now })
      .where(inArray(deliveries.id, rows.map(({ delivery }) => delivery.id)));
    return rows.map(({ delivery }) => ({ ...delivery, attemptCount: delivery.attemptCount + 1 }));
  });
  summary.claimed = claimed.length;
  const processDelivery = async (delivery: (typeof claimed)[number]) => {
    let attemptedToken: string | undefined;
    const finish = (status: "sent" | "failed" | "skipped", lastError: string | null = null, permanent = false) => db.update(deliveries).set({
      status, lastError, updatedAt: now, ...(status === "sent" ? { sentAt: now } : {}),
      ...(permanent ? { attemptCount: 5 } : {}), nextAttemptAt: new Date(now.getTime() + emailRetryDelayMs(delivery.attemptCount)),
    }).where(and(eq(deliveries.id, delivery.id), eq(deliveries.status, "processing"), eq(deliveries.lastAttemptAt, now)));
    try {
      const [context] = await db.select({ device: devices, user: users, week: contestWeeks }).from(devices)
        .innerJoin(users, eq(users.id, devices.userId)).innerJoin(contestWeeks, eq(contestWeeks.id, delivery.contestWeekId))
        .where(and(eq(devices.id, delivery.deviceId), eq(devices.userId, delivery.userId))).limit(1);
      if (!context) { await finish("skipped"); summary.skipped++; return; }
      const { device, user, week } = context;
      const [entry] = await db.select().from(contestEntries).where(and(eq(contestEntries.userId, user.id), eq(contestEntries.contestWeekId, week.id))).limit(1);
      const [version] = delivery.entryVersionId && entry ? await db.select().from(entryVersions).where(and(
        eq(entryVersions.id, delivery.entryVersionId), eq(entryVersions.contestEntryId, entry.id),
      )).limit(1) : [];
      const statuses = delivery.kind === "results_available" ? await db.select({ status: games.status }).from(games).where(eq(games.contestWeekId, week.id)) : [];
      const kind = delivery.kind as PlayerPushKind;
      if (!nativeDeliveryApplies({ kind, preferences: device, accountState: user.accountState, weekStatus: week.status,
        deadline: week.entryDeadline, now, versionNumber: entry?.currentVersionNumber ?? 0,
        hasDeliveryVersion: Boolean(version), gameStatuses: statuses.map((game) => game.status) })) {
        await finish("skipped"); summary.skipped++; return;
      }
      // Revoked/expired sessions must never continue to receive player alerts after sign-out.
      let session;
      try { session = await (await clerkClient()).sessions.getSession(device.clerkSessionId); }
      catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
      }
      if (!session || session.status !== "active" || session.userId !== user.clerkUserId) {
        await db.delete(devices).where(and(eq(devices.id, device.id), eq(devices.clerkSessionId, device.clerkSessionId)));
        summary.skipped++; return;
      }
      const content = buildPlayerPush({ kind, weekId: week.id, weekLabel: week.label || formatWeekName(week.seasonPhase, week.weekNumber),
        entryDeadline: week.entryDeadline, versionNumber: version?.versionNumber });
      const [stillRegistered] = await db.select({ id: devices.id }).from(devices).where(and(
        eq(devices.id, device.id), eq(devices.userId, delivery.userId), eq(devices.deviceToken, device.deviceToken),
        eq(devices.clerkSessionId, device.clerkSessionId), eq(devices.enabled, true), eq(devices[preferenceForKind[kind]], true),
      )).limit(1);
      if (!stillRegistered) { await finish("skipped"); summary.skipped++; return; }
      attemptedToken = device.deviceToken;
      await sendNativePush({ environment: device.environment as APNsEnvironment, deviceToken: device.deviceToken,
        payload: nativePushPayload({ ...content, kind, weekId: week.id, userId: user.id }), collapseKey: delivery.dedupeKey,
        expiresAt: ["week_published", "deadline_approaching"].includes(kind) ? week.entryDeadline : new Date(now.getTime() + 86400_000),
      });
      await finish("sent"); summary.sent++;
    } catch (error) {
      if (error instanceof APNsDeliveryError && error.disposition === "invalid_device" && attemptedToken) {
        // Disable only the token that failed; preserve a concurrent token refresh.
        await db.update(devices).set({ enabled: false }).where(and(
          eq(devices.id, delivery.deviceId), eq(devices.deviceToken, attemptedToken), lte(devices.updatedAt, now),
        ));
        await finish("skipped", "Device token expired or invalid."); summary.skipped++;
      } else {
        await finish("failed", "Apple push delivery was not accepted.", error instanceof APNsDeliveryError && error.disposition === "permanent");
        summary.failed++;
      }
    }
  };
  // Four workers bound both connection count and worst-case execution time.
  const pending = [...claimed];
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
    let delivery;
    while ((delivery = pending.shift())) await processDelivery(delivery);
  }));
  if (summary.failed) await reportOperationalIssue({ kind: "native_push_delivery", identity: "apns", severity: "warning",
    message: "One or more iPhone notifications could not be delivered.", context: { failed_count: summary.failed }, now });
  return summary;
}
