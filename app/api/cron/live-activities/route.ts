import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/security/cron-auth";
import { runLiveActivities } from "@/lib/live-activities/service";
import { liveActivityReadiness, recordLiveActivityHeartbeat } from "@/lib/live-activities/health";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (authorizeCronRequest(request) !== "authorized") return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const diagnostic = new URL(request.url).searchParams.get("check") === "1";
  const started = Date.now();
  try {
    if (diagnostic) {
      const readiness = await liveActivityReadiness();
      return NextResponse.json(readiness, { status: readiness.schemaReady ? 200 : 503, headers: { "Cache-Control": "private, no-store" } });
    }
    const result = await runLiveActivities();
    if (result.enabled) await recordLiveActivityHeartbeat(result.failed > 0);
    console.log(JSON.stringify({ event: "live_activity_tick", ...result, durationMs: Date.now() - started }));
    return NextResponse.json(result, { status: result.failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    // A diagnostic probe must not change worker health or trigger an alert.
    if (!diagnostic && process.env.LIVE_ACTIVITIES_ENABLED === "true") {
      try { await recordLiveActivityHeartbeat(true); } catch { /* The external monitor detects missing heartbeat. */ }
    }
    console.error(JSON.stringify({ event: "live_activity_tick_failed", diagnostic, durationMs: Date.now() - started }));
    return NextResponse.json({ error: "Live Activity processing failed." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
