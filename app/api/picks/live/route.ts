import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAppUser } from "@/lib/auth/app-user";
import { getLivePlayerPicks } from "@/lib/entries/service";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const querySchema = z.uuid();

export async function GET(request: Request) {
  const appUser = await requireAppUser();
  if (appUser.accountState !== "active") {
    return NextResponse.json({ error: "Active player access is required." }, { status: 403 });
  }

  const weekId = querySchema.safeParse(new URL(request.url).searchParams.get("weekId"));
  if (!weekId.success) {
    return NextResponse.json({ error: "A valid contest week is required." }, { status: 400 });
  }

  const rateLimit = await consumeRateLimit({
    scope: "live_player_picks",
    identifier: appUser.id,
    limit: 90,
    windowMs: 10 * 60 * 1_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Live picks refresh is paused briefly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const players = await getLivePlayerPicks(weekId.data);
  if (!players) {
    return NextResponse.json({ error: "This contest week is not published." }, { status: 404 });
  }

  return NextResponse.json(
    { players },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
