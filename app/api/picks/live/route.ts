import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { requireAppUser } from "@/lib/auth/app-user";
import { getLivePlayerPicks } from "@/lib/entries/service";
import { reportOperationalIssue, resolveOperationalIssue } from "@/lib/monitoring/operational-alerts";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const querySchema = z.uuid();
const LEGACY_UNHANDLED_ALERT_IDENTITY = "/api/picks/live:Error";

function operationalErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown";
  const candidate = error as { code?: unknown; message?: unknown };
  if (typeof candidate.code === "string" && /^[A-Z0-9_]{2,48}$/i.test(candidate.code)) {
    return candidate.code;
  }
  if (typeof candidate.message === "string" && /^[A-Z0-9_]{2,48}$/.test(candidate.message)) {
    return candidate.message;
  }
  return "unexpected_error";
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to refresh live picks." }, { status: 401 });
  }

  const weekId = querySchema.safeParse(new URL(request.url).searchParams.get("weekId"));
  if (!weekId.success) {
    return NextResponse.json({ error: "A valid contest week is required." }, { status: 400 });
  }

  try {
    const appUser = await requireAppUser(userId);
    if (appUser.accountState !== "active") {
      return NextResponse.json({ error: "Active player access is required." }, { status: 403 });
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

    after(() => resolveOperationalIssue("application_error", LEGACY_UNHANDLED_ALERT_IDENTITY));

    return NextResponse.json(
      { players },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    const errorCode = operationalErrorCode(error);
    await reportOperationalIssue({
      kind: "live_picks_feed_error",
      identity: errorCode,
      severity: "error",
      message: "The live player-picks feed could not be refreshed.",
      context: { route: "/api/picks/live", method: "GET", errorCode },
    });
    return NextResponse.json(
      { error: "Live picks are temporarily unavailable. Your saved picks are unaffected." },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }
}
