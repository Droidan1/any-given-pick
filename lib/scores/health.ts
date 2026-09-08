import "server-only";

import { and, eq, isNull, lt, or } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { getDb } from "@/lib/db";
import { providerSyncStates } from "@/lib/db/schema";
import { reportOperationalIssue, resolveOperationalIssue } from "@/lib/monitoring/operational-alerts";
import { STANDINGS_CACHE_TAG } from "@/lib/standings/service";
import { syncRecentEspnScores, type ScoreSyncSummary } from "./sync";
import { isScoreSyncReady, scoreSyncFreshnessWindowMinutes } from "./watchdog-policy";

const SCORE_SYNC_KEY = "espn_scores";
const SCORE_SYNC_PROVIDER = "espn";

export type ScoreSyncStatus = "idle" | "running" | "healthy" | "warning" | "failed";

export type ScoreSyncHealth = {
  status: ScoreSyncStatus;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  checkedWeeks: number;
  checkedGames: number;
  updatedGames: number;
  errorMessage: string | null;
};

function normalizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "The score provider request failed.";
  return message.slice(0, 500);
}

function serializeHealth(
  row: typeof providerSyncStates.$inferSelect | undefined,
): ScoreSyncHealth {
  return {
    status: (row?.status as ScoreSyncStatus | undefined) ?? "idle",
    lastAttemptAt: row?.lastAttemptAt?.toISOString() ?? null,
    lastSuccessAt: row?.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: row?.lastFailureAt?.toISOString() ?? null,
    checkedWeeks: row?.checkedWeeks ?? 0,
    checkedGames: row?.checkedGames ?? 0,
    updatedGames: row?.updatedGames ?? 0,
    errorMessage: row?.errorMessage ?? null,
  };
}

export async function getScoreSyncHealth(): Promise<ScoreSyncHealth> {
  const [row] = await getDb()
    .select()
    .from(providerSyncStates)
    .where(eq(providerSyncStates.key, SCORE_SYNC_KEY))
    .limit(1);
  return serializeHealth(row);
}

export async function evaluateScoreSyncWatchdog(now = new Date()): Promise<{
  health: ScoreSyncHealth;
  ready: boolean;
  freshnessWindowMinutes: number;
}> {
  const health = await getScoreSyncHealth();
  const freshnessWindowMinutes = scoreSyncFreshnessWindowMinutes(now);
  const ready = isScoreSyncReady({
    status: health.status,
    lastAttemptAt: health.lastAttemptAt,
    now,
    freshnessWindowMinutes,
  });

  if (ready) {
    await resolveOperationalIssue("score_sync_watchdog", "scheduler_freshness");
  } else {
    await reportOperationalIssue({
      kind: "score_sync_watchdog",
      identity: "scheduler_freshness",
      severity: "warning",
      message: "The score-sync scheduler is stale, has not started, or most recently failed.",
      context: { status: health.status, freshnessWindowMinutes },
      now,
    });
  }
  return { health, ready, freshnessWindowMinutes };
}

export async function inspectScoreSyncWatchdog(now = new Date()): Promise<{
  health: ScoreSyncHealth;
  ready: boolean;
  freshnessWindowMinutes: number;
}> {
  const health = await getScoreSyncHealth();
  const freshnessWindowMinutes = scoreSyncFreshnessWindowMinutes(now);
  return {
    health,
    ready: isScoreSyncReady({
      status: health.status,
      lastAttemptAt: health.lastAttemptAt,
      now,
      freshnessWindowMinutes,
    }),
    freshnessWindowMinutes,
  };
}

async function completeScoreSyncAttempt(now: Date): Promise<ScoreSyncSummary> {
  const db = getDb();
  try {
    const summary = await syncRecentEspnScores(now);
    const errorMessage = summary.errors.length > 0
      ? summary.errors.join(" · ").slice(0, 500)
      : null;
    await db
      .update(providerSyncStates)
      .set({
        status: errorMessage ? "warning" : "healthy",
        lastSuccessAt: errorMessage ? undefined : now,
        lastFailureAt: errorMessage ? now : undefined,
        checkedWeeks: summary.checkedWeeks,
        checkedGames: summary.checkedGames,
        updatedGames: summary.updatedGames,
        errorMessage,
        updatedAt: now,
      })
      .where(eq(providerSyncStates.key, SCORE_SYNC_KEY));
    if (summary.updatedGames > 0) revalidateTag(STANDINGS_CACHE_TAG, "max");
    if (errorMessage) {
      await reportOperationalIssue({
        kind: "score_sync",
        identity: SCORE_SYNC_KEY,
        severity: "warning",
        message: errorMessage,
        context: {
          checkedWeeks: summary.checkedWeeks,
          checkedGames: summary.checkedGames,
          updatedGames: summary.updatedGames,
        },
        now,
      });
    } else {
      await resolveOperationalIssue("score_sync", SCORE_SYNC_KEY);
    }
    return summary;
  } catch (error) {
    const errorMessage = normalizeError(error);
    await db
      .update(providerSyncStates)
      .set({
        status: "failed",
        lastFailureAt: now,
        errorMessage,
        updatedAt: now,
      })
      .where(eq(providerSyncStates.key, SCORE_SYNC_KEY));
    await reportOperationalIssue({
      kind: "score_sync",
      identity: SCORE_SYNC_KEY,
      severity: "error",
      message: errorMessage,
      context: { provider: SCORE_SYNC_PROVIDER },
      now,
    });
    throw error;
  }
}

export async function recoverStaleScoreSyncWithHealth(
  now = new Date(),
  freshnessWindowMinutes = scoreSyncFreshnessWindowMinutes(now),
): Promise<ScoreSyncSummary | null> {
  const db = getDb();
  const staleBefore = new Date(now.getTime() - freshnessWindowMinutes * 60 * 1_000);
  const runningState = {
    provider: SCORE_SYNC_PROVIDER,
    status: "running",
    lastAttemptAt: now,
    errorMessage: null,
    updatedAt: now,
  } as const;

  const [inserted] = await db
    .insert(providerSyncStates)
    .values({ key: SCORE_SYNC_KEY, ...runningState })
    .onConflictDoNothing({ target: providerSyncStates.key })
    .returning({ key: providerSyncStates.key });

  let claimed = Boolean(inserted);
  if (!claimed) {
    const [updated] = await db
      .update(providerSyncStates)
      .set(runningState)
      .where(and(
        eq(providerSyncStates.key, SCORE_SYNC_KEY),
        or(
          eq(providerSyncStates.status, "failed"),
          isNull(providerSyncStates.lastAttemptAt),
          lt(providerSyncStates.lastAttemptAt, staleBefore),
        ),
      ))
      .returning({ key: providerSyncStates.key });
    claimed = Boolean(updated);
  }

  return claimed ? completeScoreSyncAttempt(now) : null;
}

export async function refreshScoreSyncIfDueWithHealth(
  now = new Date(),
  minimumIntervalMs = 55_000,
): Promise<ScoreSyncSummary | null> {
  const db = getDb();
  const dueBefore = new Date(now.getTime() - minimumIntervalMs);
  const runningState = {
    provider: SCORE_SYNC_PROVIDER,
    status: "running",
    lastAttemptAt: now,
    errorMessage: null,
    updatedAt: now,
  } as const;

  const [inserted] = await db
    .insert(providerSyncStates)
    .values({ key: SCORE_SYNC_KEY, ...runningState })
    .onConflictDoNothing({ target: providerSyncStates.key })
    .returning({ key: providerSyncStates.key });

  let claimed = Boolean(inserted);
  if (!claimed) {
    const [updated] = await db
      .update(providerSyncStates)
      .set(runningState)
      .where(and(
        eq(providerSyncStates.key, SCORE_SYNC_KEY),
        or(
          eq(providerSyncStates.status, "failed"),
          isNull(providerSyncStates.lastAttemptAt),
          lt(providerSyncStates.lastAttemptAt, dueBefore),
        ),
      ))
      .returning({ key: providerSyncStates.key });
    claimed = Boolean(updated);
  }

  return claimed ? completeScoreSyncAttempt(now) : null;
}

export async function runEspnScoreSyncWithHealth(
  now = new Date(),
): Promise<ScoreSyncSummary> {
  const db = getDb();
  await db
    .insert(providerSyncStates)
    .values({
      key: SCORE_SYNC_KEY,
      provider: SCORE_SYNC_PROVIDER,
      status: "running",
      lastAttemptAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: providerSyncStates.key,
      set: {
        status: "running",
        lastAttemptAt: now,
        errorMessage: null,
        updatedAt: now,
      },
    });

  return completeScoreSyncAttempt(now);
}
