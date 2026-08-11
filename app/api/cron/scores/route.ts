import { timingSafeEqual } from "node:crypto";
import { runEspnScoreSyncWithHealth } from "@/lib/scores/health";
import { cleanupExpiredRateLimitBuckets } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function secretsMatch(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length
    && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json(
      { error: "Score synchronization is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const receivedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!secretsMatch(receivedSecret, cronSecret)) {
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
