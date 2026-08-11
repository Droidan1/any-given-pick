import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { providerSyncStates } from "@/lib/db/schema";
import { syncRecentEspnScores, type ScoreSyncSummary } from "./sync";

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
    return summary;
  } catch (error) {
    await db
      .update(providerSyncStates)
      .set({
        status: "failed",
        lastFailureAt: now,
        errorMessage: normalizeError(error),
        updatedAt: now,
      })
      .where(eq(providerSyncStates.key, SCORE_SYNC_KEY));
    throw error;
  }
}
