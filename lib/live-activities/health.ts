import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { providerSyncStates } from "@/lib/db/schema";
import { apnsConfigured } from "@/lib/native-push/apns";

const KEY = "ios_live_activities";
const FRESHNESS_MS = 5 * 60_000;

export function heartbeatReady(row: { status: string; lastSuccessAt: Date | null } | undefined, now: Date) {
  if (!row?.lastSuccessAt || row.status === "failed" || row.status === "warning") return false;
  const age = now.getTime() - row.lastSuccessAt.getTime();
  return age >= -60_000 && age <= FRESHNESS_MS;
}

/** Read-only: monitoring must never trigger private notifications. */
export async function inspectLiveActivityHealth(now = new Date()): Promise<"disabled" | "ok" | "stale_or_failed" | "unavailable"> {
  if (process.env.LIVE_ACTIVITIES_ENABLED !== "true") return "disabled";
  try {
    const [row] = await getDb().select({ status: providerSyncStates.status, lastSuccessAt: providerSyncStates.lastSuccessAt })
      .from(providerSyncStates).where(eq(providerSyncStates.key, KEY)).limit(1);
    return heartbeatReady(row, now) ? "ok" : "stale_or_failed";
  } catch { return "unavailable"; }
}

export async function recordLiveActivityHeartbeat(failed: boolean, now = new Date()) {
  const values = { provider: "activitykit", status: failed ? "failed" : "healthy",
    lastAttemptAt: now, ...(failed ? { lastFailureAt: now } : { lastSuccessAt: now }), updatedAt: now };
  await getDb().insert(providerSyncStates).values({ key: KEY, ...values })
    .onConflictDoUpdate({ target: providerSyncStates.key, set: values });
}

/** Authenticated diagnostics only. No token values, users, picks, or external sends. */
export async function liveActivityReadiness() {
  const result = await getDb().execute<{ devices: string | null; sessions: string | null; score_columns: number }>(sql`
    select to_regclass('public.live_activity_devices')::text as devices,
      to_regclass('public.live_activity_sessions')::text as sessions,
      (select count(*)::integer from information_schema.columns where table_schema = 'public'
        and table_name = 'games' and column_name in ('score_period','score_clock','score_detail','score_checked_at')) as score_columns
  `);
  const row = result.rows[0];
  return { enabled: process.env.LIVE_ACTIVITIES_ENABLED === "true",
    schemaReady: Boolean(row?.devices && row?.sessions && row.score_columns === 4),
    sandboxConfigured: apnsConfigured("sandbox"), productionConfigured: apnsConfigured("production"),
    scheduler: await inspectLiveActivityHealth() };
}
