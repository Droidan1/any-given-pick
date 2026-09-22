import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminRole } from "@/lib/auth/admin";
import { requireAppUser } from "@/lib/auth/app-user";
import { getWeeklyResults } from "@/lib/results/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const rawWeekId = new URL(request.url).searchParams.get("weekId");
  const weekId = rawWeekId ? z.uuid().safeParse(rawWeekId) : null;
  if (weekId && !weekId.success) {
    return NextResponse.json({ error: "A valid contest week is required." }, { status: 400 });
  }

  try {
    const appUser = await requireAppUser(userId);
    if (appUser.accountState !== "active" && !(await hasAdminRole(appUser.id))) {
      return NextResponse.json({ error: "Active player access is required." }, { status: 403 });
    }

    const results = await getWeeklyResults({
      currentUserId: appUser.id,
      weekId: weekId?.data,
    });
    return NextResponse.json({ results }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json(
      { error: "Results are temporarily unavailable." },
      { status: 503, headers: { "Retry-After": "15" } },
    );
  }
}
