import { runPlayerEmailCycle } from "@/lib/email/player-notifications";
import { authorizeCronRequest } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (authorization === "unconfigured") {
    return Response.json(
      { error: "Email reminders are not configured." },
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
    const summary = await runPlayerEmailCycle();
    return Response.json(summary, {
      status: summary.failed > 0 ? 502 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "The email reminder cycle failed." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
