import "server-only";
import { createHash } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { hasAdminRole } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import { contestEntries, contestWeeks, games, users, liveActivityDevices as devices, liveActivitySessions as sessions } from "@/lib/db/schema";
import { formatWeekName } from "@/lib/admin/schedule-import";
import { APNsDeliveryError, apnsConfigured, sendNativePush, type APNsEnvironment } from "@/lib/native-push/apns";
import { getWeeklyResults } from "@/lib/results/service";
import { buildLiveWeekRace } from "@/lib/race/rules";
import { refreshScoreSyncIfDueWithHealth } from "@/lib/scores/health";
import { reportOperationalIssue } from "@/lib/monitoring/operational-alerts";
import { activityPayload, canFollow, deadlineWindow, emptyState, raceWindows, MINUTE, SESSION_MS, type ActivityAttributes, type ActivityKind, type ActivityState } from "./policy";
import { isPrivateTest, privateTestContent, PRIVATE_TEST_DURATION, PRIVATE_TEST_PREFIX } from "./private-test";

export const liveActivitiesEnabled = () => process.env.LIVE_ACTIVITIES_ENABLED === "true";
export class LiveActivityInputError extends Error {}
export type Device = typeof devices.$inferSelect;
type Session = typeof sessions.$inferSelect;
const workingStatuses = ["pending", "starting", "active", "ending"];

export async function ownedDevice(installationId: string, userId: string) {
  const [device] = await getDb().select().from(devices).where(and(eq(devices.installationId, installationId), eq(devices.userId, userId))).limit(1);
  return device;
}

export async function stopDevice(device: Device) {
  // Keep end tokens briefly so even an offline phone can receive the end event.
  await getDb().transaction(async (tx) => {
    await tx.update(devices).set({ enabled: false, pushToStartToken: null, updatedAt: new Date() }).where(eq(devices.id, device.id));
    await tx.update(sessions).set({ status: "ending", updatedAt: new Date() }).where(and(eq(sessions.deviceId, device.id), inArray(sessions.status, workingStatuses)));
  });
}

export async function sessionList(deviceId: string) {
  return getDb().select({ sessionId: sessions.id, kind: sessions.kind, gameId: sessions.gameId, status: sessions.status,
    isTest: sql<boolean>`${sessions.sessionKey} like 'private-test:%'`, failureCount: sessions.failureCount })
    .from(sessions).where(and(eq(sessions.deviceId, deviceId), or(inArray(sessions.status, workingStatuses),
      and(sql`${sessions.sessionKey} like 'private-test:%'`, sql`${sessions.endsAt} > now() - interval '1 hour'`))))
    .orderBy(desc(sessions.startsAt)).limit(50);
}

/** Only called after admin authorization. Idempotent requests and a device lock prevent duplicate tests. */
export async function startPrivateTest(device: Device, kind: ActivityKind, requestId: string, now = new Date()) {
  if (device.environment !== "sandbox") throw new LiveActivityInputError("Private tests require an Xcode sandbox build.");
  const db = getDb();
  const session = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${device.id}))`);
    const [fresh] = await tx.select().from(devices).where(and(eq(devices.id, device.id), eq(devices.userId, device.userId))).for("update");
    if (!fresh || fresh.clerkSessionId !== device.clerkSessionId || fresh.environment !== "sandbox"
      || !fresh.enabled || !fresh.authorized) throw new LiveActivityInputError("Reconnect and enable Live Activities first.");
    if ((kind === "deadline" && !fresh.deadline) || (kind === "race" && !fresh.race)) throw new LiveActivityInputError("Enable this activity's preference first.");
    if (!apnsConfigured("sandbox")) throw new LiveActivityInputError("Sandbox push delivery is not configured.");
    if (kind !== "game" && !fresh.pushToStartToken) throw new LiveActivityInputError("Refresh the connection to register Apple's automatic-start token.");
    const key = `${PRIVATE_TEST_PREFIX}${requestId}`;
    const [existing] = await tx.select().from(sessions).where(and(eq(sessions.deviceId, device.id), eq(sessions.sessionKey, key)));
    if (existing) {
      if (existing.kind !== kind) throw new LiveActivityInputError("This request was already used for another test.");
      if (existing.endsAt <= now || !["pending", "starting", "active"].includes(existing.status)) throw new LiveActivityInputError("This test has ended. Refresh and start a new test.");
      return existing;
    }
    const [running] = await tx.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.deviceId, device.id),
      sql`${sessions.sessionKey} like 'private-test:%'`, inArray(sessions.status, workingStatuses)));
    if (running) throw new LiveActivityInputError("Stop the current private test before starting another.");
    // The existing foreign key requires a week; it is only a reference. No contest rows are written.
    const [week] = await tx.select({ id: contestWeeks.id }).from(contestWeeks).where(inArray(contestWeeks.status, ["published", "locked", "final"]))
      .orderBy(desc(contestWeeks.entryDeadline)).limit(1);
    if (!week) throw new LiveActivityInputError("Publish a week before testing Live Activities.");
    const startsAt = new Date(now.getTime() + (kind === "game" ? 0 : 20_000));
    const [created] = await tx.insert(sessions).values({ deviceId: device.id, contestWeekId: week.id, kind, sessionKey: key,
      startsAt, endsAt: new Date(startsAt.getTime() + PRIVATE_TEST_DURATION), updatedAt: now }).returning();
    return created;
  });
  const content = privateTestContent(session, device, now);
  return { sessionId: session.id, mode: kind === "game" ? "local" : "remote", endsAt: session.endsAt.toISOString(),
    seed: kind === "game" ? { attributes: content.attributes, state: content.state } : null };
}

/** Foreground-only game starts: the caller receives a seed and ActivityKit produces its update token. */
export async function followGame(device: Device, gameId: string, now = new Date()) {
  const db = getDb();
  const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  if (!game || !canFollow(game, now)) throw new LiveActivityInputError("Follow a game within 7 hours of kickoff, or while it is live.");
  const [week] = await db.select().from(contestWeeks).where(and(eq(contestWeeks.id, game.contestWeekId), inArray(contestWeeks.status, ["published", "locked", "final"]))).limit(1);
  if (!week) throw new LiveActivityInputError("This game is not on a published card.");
  const key = `game:${gameId}`;
  const session = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${device.id}))`);
    const [existing] = await tx.select().from(sessions).where(and(eq(sessions.deviceId, device.id), eq(sessions.sessionKey, key))).for("update");
    if (existing && ["pending", "active", "starting"].includes(existing.status) && existing.endsAt > now) return existing;
    const active = await tx.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.deviceId, device.id), eq(sessions.kind, "game"), inArray(sessions.status, workingStatuses)));
    if (active.length >= 2) throw new LiveActivityInputError("Stop following one of your two games before adding another.");
    const values = { deviceId: device.id, contestWeekId: week.id, gameId, kind: "game", sessionKey: key,
      startsAt: now, endsAt: new Date(now.getTime() + SESSION_MS), status: "pending", updatedAt: now };
    // A fresh session ID prevents late token callbacks from a previous Follow replacing the new token.
    if (existing) await tx.delete(sessions).where(eq(sessions.id, existing.id));
    const [created] = await tx.insert(sessions).values(values).returning();
    return created;
  });
  const content = await buildContent(session, device, now);
  if (!content) throw new LiveActivityInputError("This game is no longer available.");
  return { attributes: content.attributes, state: content.state };
}

async function buildContent(session: Session, device: Device, now: Date) {
  if (isPrivateTest(session.sessionKey)) return privateTestContent(session, device, now);
  const db = getDb();
  const [week] = await db.select().from(contestWeeks).where(eq(contestWeeks.id, session.contestWeekId)).limit(1);
  if (!week || week.status === "draft") return null;
  const weekGames = await db.select().from(games).where(eq(games.contestWeekId, week.id));
  const [entry] = await db.select().from(contestEntries).where(and(eq(contestEntries.contestWeekId, week.id), eq(contestEntries.userId, device.userId))).limit(1);
  const attributes: ActivityAttributes = { sessionId: session.id, userId: device.userId, weekId: week.id,
    weekLabel: week.label || formatWeekName(week.seasonPhase, week.weekNumber), kind: session.kind as ActivityKind, gameId: session.gameId ?? "" };
  const state: ActivityState = { ...emptyState(now), totalGames: weekGames.length, deadline: Math.floor(week.entryDeadline.getTime() / 1000) };
  let shouldEnd = session.endsAt <= now || session.status === "ending" || !device.enabled || !device.authorized;
  if (session.kind === "deadline") {
    state.title = "Card deadline";
    state.picksSaved = weekGames.filter((game) => [game.awayTeamCode, game.homeTeamCode].includes(entry?.draftPicks?.[game.id] ?? "")).length;
    const submitted = Boolean(entry && entry.currentVersionNumber > 0);
    state.detail = submitted ? "Official card submitted" : `${state.picksSaved}/${state.totalGames} picks saved · Submit in the app`;
    shouldEnd ||= !device.deadline || !deadlineWindow({ weekStatus: week.status, deadline: week.entryDeadline, submitted, now }) || entry?.status === "disqualified";
  } else if (session.kind === "game") {
    const game = weekGames.find((candidate) => candidate.id === session.gameId);
    if (!game) return null;
    state.title = `${game.awayTeamCode} at ${game.homeTeamCode}`;
    state.awayCode = game.awayTeamCode; state.homeCode = game.homeTeamCode;
    state.awayScore = game.awayScore; state.homeScore = game.homeScore; state.gameStatus = game.status;
    state.clock = game.scoreDetail || (game.scorePeriod ? `Q${game.scorePeriod} ${game.scoreClock ?? ""}`.trim() : "");
    state.detail = game.status === "scheduled" ? "Kickoff" : game.status === "in_progress" ? (state.clock || "Live") : game.status;
    state.deadline = Math.floor(game.kickoffAt.getTime() / 1000);
    state.updatedAt = Math.floor((game.scoreCheckedAt ?? game.updatedAt).getTime() / 1000);
    state.staleAt = game.status === "scheduled" ? Math.floor(game.kickoffAt.getTime() / 1000) + 180 : state.updatedAt + 180;
    shouldEnd ||= ["final", "canceled", "postponed"].includes(game.status);
  } else {
    state.title = "Live week race";
    const results = await getWeeklyResults({ weekId: week.id, currentUserId: device.userId, now });
    const race = buildLiveWeekRace(results);
    const player = race.players.find((candidate) => candidate.userId === device.userId);
    const activeWindow = raceWindows(weekGames, now).find((window) => `week:${week.id}:${window.key}` === session.sessionKey);
    shouldEnd ||= !device.race || !activeWindow || !player || results.selectedWeek?.id !== week.id || entry?.status === "disqualified";
    state.correct = player?.correct ?? 0; state.rank = player?.rank ?? null; state.playerCount = race.players.length;
    state.remaining = (player?.live ?? 0) + (player?.pending ?? 0);
    state.behind = Math.max(0, (race.players[0]?.projectedCorrect ?? 0) - (player?.projectedCorrect ?? 0));
    state.detail = `${race.liveCount} live · Projected position, not final standings`;
    const liveGames = weekGames.filter((game) => game.status === "in_progress" || (game.status === "scheduled" && game.kickoffAt <= now));
    if (liveGames.length) {
      state.updatedAt = Math.floor(Math.min(...liveGames.map((game) => (game.scoreCheckedAt ?? game.updatedAt).getTime())) / 1000);
      state.staleAt = state.updatedAt + 180;
    }
  }
  return { attributes, state, shouldEnd };
}

async function queueAutomatic(now: Date) {
  const db = getDb();
  const recipients = await db.select({ device: devices }).from(devices).innerJoin(users, eq(users.id, devices.userId))
    .where(and(eq(devices.enabled, true), eq(devices.authorized, true), eq(users.accountState, "active")));
  const weeks = await db.select().from(contestWeeks).where(inArray(contestWeeks.status, ["published", "locked"]));
  for (const week of weeks) {
    const weekGames = await db.select().from(games).where(eq(games.contestWeekId, week.id));
    const entries = await db.select().from(contestEntries).where(eq(contestEntries.contestWeekId, week.id));
    const dailyWindows = raceWindows(weekGames, now);
    for (const { device } of recipients) {
      if (!device.pushToStartToken || !apnsConfigured(device.environment as APNsEnvironment)) continue;
      const entry = entries.find((row) => row.userId === device.userId);
      if (entry?.status === "disqualified") continue;
      const deadline = device.deadline ? deadlineWindow({ weekStatus: week.status, deadline: week.entryDeadline, submitted: Boolean(entry && entry.currentVersionNumber > 0), now }) : null;
      const windows = [ ...(deadline ? [{ ...deadline, kind: "deadline" }] : []),
        ...(device.race && entry && entry.currentVersionNumber > 0 && week.entryDeadline <= now ? dailyWindows.map((window) => ({ ...window, kind: "race" })) : []) ];
      for (const window of windows) {
        // A unique device/window key also remembers manual dismissal. No auto-resurrection in this window.
        await db.insert(sessions).values({ deviceId: device.id, contestWeekId: week.id, kind: window.kind,
          sessionKey: `week:${week.id}:${window.key}`, startsAt: window.startsAt, endsAt: window.endsAt }).onConflictDoNothing();
      }
    }
  }
}

async function claim(now: Date) {
  return getDb().transaction(async (tx) => {
    const [session] = await tx.select().from(sessions).where(and(inArray(sessions.status, workingStatuses),
      or(lte(sessions.startsAt, now), eq(sessions.status, "ending")),
      or(isNull(sessions.leaseUntil), lt(sessions.leaseUntil, now)),
      // Pending manual follows are created locally; never send a second remote start.
      or(sql`${sessions.kind} <> 'game'`, sql`${sessions.status} <> 'pending'`, lt(sessions.updatedAt, new Date(now.getTime() - 5 * MINUTE))),
      or(isNull(sessions.lastSentAt), lt(sessions.lastSentAt, new Date(now.getTime() - 55_000))),
    )).orderBy(sessions.updatedAt).limit(1).for("update", { skipLocked: true });
    if (!session) return null;
    await tx.update(sessions).set({ leaseUntil: new Date(now.getTime() + 2 * MINUTE), updatedAt: now }).where(eq(sessions.id, session.id));
    return session;
  });
}

async function deliver(session: Session, now: Date) {
  const db = getDb();
  const [device] = await db.select().from(devices).where(eq(devices.id, session.deviceId)).limit(1);
  if (!device) return;
  const [user] = await db.select({ clerkUserId: users.clerkUserId, accountState: users.accountState }).from(users).where(eq(users.id, device.userId)).limit(1);
  let authorized = user?.accountState === "active" && device.authorized && device.enabled;
  if (authorized) {
    try {
      const authSession = await (await clerkClient()).sessions.getSession(device.clerkSessionId);
      authorized = authSession.status === "active" && authSession.userId === user.clerkUserId;
    } catch (error) {
      if ((error as { status?: number }).status === 404) authorized = false;
      else throw error; // Fail closed on an auth outage, without deleting a legitimate registration.
    }
  }
  if (!authorized) { await stopDevice(device); device.enabled = false; }
  const content = await buildContent(session, device, now);
  // Test privilege is checked again by the worker, not trusted from the client or queue.
  const testAllowed = !isPrivateTest(session.sessionKey) || (device.environment === "sandbox" && await hasAdminRole(device.userId));
  const shouldEnd = !content || content.shouldEnd || !authorized || !testAllowed;
  if ((session.kind === "game" && session.status === "pending") || (shouldEnd && !session.updateToken)) {
    await db.update(sessions).set({ status: "ended", updateToken: null, leaseUntil: null, updatedAt: now }).where(eq(sessions.id, session.id));
    return;
  }
  // A remotely started activity may be waiting for the phone's update token. Never resend an uncertain start.
  if (session.status === "starting" && !session.updateToken && !shouldEnd) return;
  let event: "start" | "update" | "end" = shouldEnd ? "end" : session.status === "pending" ? "start" : "update";
  const safeContent = content ?? { attributes: { sessionId: session.id, userId: device.userId, weekId: session.contestWeekId,
    weekLabel: "Any Given Pick", kind: session.kind as ActivityKind, gameId: session.gameId ?? "" }, state: emptyState(now) };
  if (!authorized) safeContent.state = { ...emptyState(now), title: "Activity ended", detail: "Open Any Given Pick to reconnect." };
  const hash = createHash("sha256").update(JSON.stringify(safeContent.state)).digest("hex");
  // Re-read ownership/preferences just before sending; settings changes invalidate queued work.
  const fresh = await ownedDevice(device.installationId, device.userId);
  if (!fresh || fresh.clerkSessionId !== device.clerkSessionId) return;
  // Never route even an end for a sandbox test to a production APNs token.
  if (isPrivateTest(session.sessionKey) && fresh.environment !== "sandbox") {
    await db.update(sessions).set({ status: "ended", updateToken: null, leaseUntil: null, updatedAt: now }).where(eq(sessions.id, session.id));
    return;
  }
  const [latest] = await db.select().from(sessions).where(eq(sessions.id, session.id)).limit(1);
  if (!latest || ["ended", "dismissed", "failed"].includes(latest.status)) return;
  if (latest.status === "ending" || !fresh.enabled || !fresh.authorized
    || (session.kind === "deadline" && !fresh.deadline) || (session.kind === "race" && !fresh.race)) event = "end";
  const token = event === "start" ? fresh.pushToStartToken : latest.updateToken;
  if (!token) return;
  if (event === "start") {
    const claimed = await db.update(sessions).set({ status: "starting", updatedAt: now }).where(and(eq(sessions.id, session.id), eq(sessions.status, "pending"))).returning({ id: sessions.id });
    if (!claimed.length) return;
  }
  await sendNativePush({ environment: device.environment as APNsEnvironment, deviceToken: token,
    payload: activityPayload({ event, ...safeContent, now }), pushType: "liveactivity",
    priority: event === "update" ? "5" : "10", collapseKey: `live-activity:${session.id}:${event}`,
    expiresAt: new Date(Math.min(now.getTime() + 90_000, event === "end" ? now.getTime() + 90_000 : session.endsAt.getTime())) });
  await db.update(sessions).set({ ...(event === "end" ? { status: "ended", updateToken: null } : {}),
    contentHash: hash, lastSentAt: now, leaseUntil: null, failureCount: 0, updatedAt: now }).where(eq(sessions.id, session.id));
}

export async function runLiveActivities(now = new Date()) {
  if (!liveActivitiesEnabled()) return { enabled: false, processed: 0, failed: 0 };
  const started = Date.now();
  const db = getDb();
  // Only ask the score provider for a fresh snapshot when opted-in devices have work.
  const [interested] = await db.select({ id: devices.id }).from(devices).where(eq(devices.enabled, true)).limit(1);
  // An unavailable score provider must not prevent card deadlines and end events from being delivered.
  if (interested) {
    try { await refreshScoreSyncIfDueWithHealth(now, 55_000); }
    catch { /* The existing score health service records this outage; cards show their stale state. */ }
  }
  await queueAutomatic(now);
  let processed = 0; let failed = 0;
  while (processed + failed < 20 && Date.now() - started < 40_000) {
    const session = await claim(now);
    if (!session) break;
    try { await deliver(session, now); processed += 1; }
    catch (error) {
      failed += 1;
      // Do not include tokens, picks, IDs, or provider responses in operational output.
      const permanent = error instanceof APNsDeliveryError && error.disposition !== "retry";
      const terminal = permanent || session.failureCount >= 4;
      await db.update(sessions).set({ failureCount: sql`${sessions.failureCount} + 1`,
        ...(terminal ? { status: "failed", updateToken: null } : {}),
        leaseUntil: terminal ? null : new Date(now.getTime() + Math.min(15, 2 ** session.failureCount) * MINUTE), updatedAt: now })
        .where(eq(sessions.id, session.id));
    }
  }
  // Ephemeral tokens and dismissal tombstones are retained only briefly after a session ends.
  await db.delete(sessions).where(lt(sessions.endsAt, new Date(now.getTime() - 2 * 24 * 60 * MINUTE)));
  await db.delete(devices).where(and(eq(devices.enabled, false), lt(devices.updatedAt, new Date(now.getTime() - 30 * 24 * 60 * MINUTE))));
  if (failed) await reportOperationalIssue({ kind: "live_activity_delivery", identity: "activitykit", severity: "warning",
    message: "Live Activity delivery needs attention.", context: { failed, processed } });
  return { enabled: true, processed, failed };
}
