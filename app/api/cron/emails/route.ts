import { runEmailNotificationCycle } from "@/lib/email/notification-cycle";
import { authorizeCronRequest } from "@/lib/security/cron-auth";
import { inspectNotificationReadiness } from "@/lib/email/notification-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (authorization === "unconfigured") {
    return Response.json(
      { error: "Scheduled notifications are not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (authorization === "unauthorized") {
    return Response.json(
      { error: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun");
    if (dryRun !== null && dryRun !== "true" && dryRun !== "false") {
      return Response.json({ error: "dryRun must be true or false." }, {
        status: 400, headers: { "Cache-Control": "no-store" },
      });
    }
    if (dryRun === "true") {
      // Authenticated, read-only connectivity/configuration check: no queue writes or sends.
      return Response.json(await inspectNotificationReadiness(), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const summary = await runEmailNotificationCycle();
    return Response.json(summary, {
      status: summary.failed > 0 ? 502 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "The scheduled notification cycle failed." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
