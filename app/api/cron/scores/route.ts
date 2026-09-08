import { runEspnScoreSyncWithHealth } from "@/lib/scores/health";
import { authorizeCronRequest } from "@/lib/security/cron-auth";
import { cleanupExpiredRateLimitBuckets } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (authorization === "unconfigured") {
    return Response.json(
      { error: "Score synchronization is not configured." },
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
    const [summary] = await Promise.all([
      runEspnScoreSyncWithHealth(),
      cleanupExpiredRateLimitBuckets(),
    ]);
    return Response.json(summary, {
      status: summary.errors.length > 0 ? 502 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "The score provider request failed." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
