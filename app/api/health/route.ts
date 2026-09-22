import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reportOperationalIssue } from "@/lib/monitoring/operational-alerts";
import { inspectLiveActivityHealth } from "@/lib/live-activities/health";
import {
  evaluateScoreSyncWatchdog,
  inspectScoreSyncWatchdog,
  recoverStaleScoreSyncWithHealth,
} from "@/lib/scores/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEALTH_HEADERS = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "CDN-Cache-Control": "max-age=30, stale-while-revalidate=30",
};

export async function GET() {
  const now = new Date();
  try {
    await getDb().execute(sql`select 1`);
    const initialScoreSync = await inspectScoreSyncWatchdog(now);
    let scoreSyncRecovery: "not_needed" | "completed" | "already_claimed" | "failed" = "not_needed";
    if (!initialScoreSync.ready) {
      try {
        const recovery = await recoverStaleScoreSyncWithHealth(
          now,
          initialScoreSync.freshnessWindowMinutes,
        );
        scoreSyncRecovery = recovery ? "completed" : "already_claimed";
      } catch {
        scoreSyncRecovery = "failed";
      }
    }
    const { ready: scoreSyncReady } = await evaluateScoreSyncWatchdog(now);
    const liveActivities = await inspectLiveActivityHealth(now);
    const ready = scoreSyncReady && ["disabled", "ok"].includes(liveActivities);
    return Response.json(
      {
        status: ready ? "ok" : "degraded",
        database: "ok",
        liveActivities,
        scoreSync: scoreSyncReady ? "ok" : "stale_or_failed",
        scoreSyncRecovery,
        checkedAt: now.toISOString(),
      },
      {
        status: ready ? 200 : 503,
        headers: HEALTH_HEADERS,
      },
    );
  } catch {
    await reportOperationalIssue({
      kind: "database_health",
      identity: "primary_database",
      severity: "error",
      message: "The application health check could not reach the primary database.",
      context: { check: "database_connectivity" },
      now,
    });
    return Response.json(
      { status: "unavailable", database: "unavailable", checkedAt: now.toISOString() },
      { status: 503, headers: HEALTH_HEADERS },
    );
  }
}
