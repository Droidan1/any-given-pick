import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminRole } from "@/lib/auth/admin";
import { requireAppUser } from "@/lib/auth/app-user";
import { getAccountSummary } from "@/lib/eligibility/service";
import { getCurrentPlayerWeek } from "@/lib/entries/service";
import { getWeeklyResults } from "@/lib/results/service";

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

  const params = new URL(request.url).searchParams;
  const homeView = params.get("view") === "home";
  const weekId = params.get("weekId") ?? undefined;
  if (weekId && (!homeView || !z.uuid().safeParse(weekId).success)) {
    return NextResponse.json({ error: "Invalid week." }, { status: 400, headers: privateHeaders });
  }

  try {
    const appUser = await requireAppUser(userId);
    const [account, isAdmin] = await Promise.all([
      getAccountSummary(appUser.id),
      hasAdminRole(appUser.id),
    ]);
    const hasPlayerAccess = account.accountState === "active" || isAdmin;
    const [currentWeek, results] = hasPlayerAccess
      ? await Promise.all([
          getCurrentPlayerWeek(appUser.id, { includeLivePicks: !homeView, ...(weekId ? { weekId } : {}) }),
          homeView ? Promise.resolve(null) : getWeeklyResults({ currentUserId: appUser.id }),
        ])
      : [null, null];

    if (hasPlayerAccess && weekId && !currentWeek) {
      return NextResponse.json({ error: "This published week is no longer available." }, { status: 404, headers: privateHeaders });
    }

    return NextResponse.json({
      serverNow: new Date().toISOString(),
      user: {
        id: appUser.id,
        displayName: account.displayName,
        isAdmin,
        account,
      },
      currentWeek,
      results,
    }, { headers: privateHeaders });
  } catch {
    return NextResponse.json(
      { error: "Your player account could not be loaded." },
      { status: 503, headers: { ...privateHeaders, "Retry-After": "15" } },
    );
  }
}
