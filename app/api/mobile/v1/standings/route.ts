import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { hasAdminRole } from "@/lib/auth/admin";
import { requireAppUser } from "@/lib/auth/app-user";
import { getSeasonStandings } from "@/lib/standings/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
};

export async function GET() {
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

    return NextResponse.json(
      { standings: await getSeasonStandings() },
      { headers: privateHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "Standings are temporarily unavailable." },
      { status: 503, headers: { ...privateHeaders, "Retry-After": "15" } },
    );
  }
}
