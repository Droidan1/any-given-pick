import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reportOperationalIssue } from "@/lib/monitoring/operational-alerts";
import { evaluateScoreSyncWatchdog } from "@/lib/scores/health";

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
    const { ready: scoreSyncReady } = await evaluateScoreSyncWatchdog(now);
    return Response.json(
      {
        status: scoreSyncReady ? "ok" : "degraded",
        database: "ok",
        scoreSync: scoreSyncReady ? "ok" : "stale_or_failed",
        checkedAt: now.toISOString(),
      },
      {
        status: scoreSyncReady ? 200 : 503,
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
