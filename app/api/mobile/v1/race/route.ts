import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { hasAdminRole } from "@/lib/auth/admin";
import { requireAppUser } from "@/lib/auth/app-user";
import { buildLiveWeekRace } from "@/lib/race/rules";
import { getWeeklyResults } from "@/lib/results/service";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
};

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401, headers: privateHeaders },
    );
  }

  try {
    const appUser = await requireAppUser(userId);
    if (appUser.accountState !== "active" && !(await hasAdminRole(appUser.id))) {
      return NextResponse.json(
        { error: "Active player access is required." },
        { status: 403, headers: privateHeaders },
      );
    }

    const weekId = new URL(request.url).searchParams.get("weekId") ?? undefined;
    if (weekId && !z.uuid().safeParse(weekId).success) return NextResponse.json({ error: "Invalid week." }, { status: 400, headers: privateHeaders });
    const results = await getWeeklyResults({ currentUserId: appUser.id, weekId });
    if (weekId && results.selectedWeek?.id !== weekId) return NextResponse.json({ error: "Week no longer available." }, { status: 404, headers: privateHeaders });
    return NextResponse.json(
      { race: buildLiveWeekRace(results) },
      { headers: privateHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "The live race is temporarily unavailable." },
      { status: 503, headers: { ...privateHeaders, "Retry-After": "15" } },
    );
  }
}
