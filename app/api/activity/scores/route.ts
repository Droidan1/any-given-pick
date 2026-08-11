import { auth } from "@clerk/nextjs/server";
import { getScoreSyncHealth } from "@/lib/scores/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });

  const health = await getScoreSyncHealth();
  return Response.json({
    status: health.status,
    lastAttemptAt: health.lastAttemptAt,
    lastSuccessAt: health.lastSuccessAt,
    lastFailureAt: health.lastFailureAt,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
