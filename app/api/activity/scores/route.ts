import { auth } from "@clerk/nextjs/server";
import { syncRecentEspnScores } from "@/lib/scores/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });

  const result = await syncRecentEspnScores();
  return Response.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
