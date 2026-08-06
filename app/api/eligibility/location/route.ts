import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAppUser } from "@/lib/auth/app-user";
import { getDb } from "@/lib/db";
import { auditEvents, eligibilityChecks } from "@/lib/db/schema";
import { getAccountSummary } from "@/lib/eligibility/service";

export const runtime = "nodejs";

const requestSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("position"),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().finite().nonnegative().max(100_000),
  }),
  z.object({ status: z.literal("denied") }),
  z.object({ status: z.literal("unavailable") }),
]);

const censusResponseSchema = z.object({
  result: z.object({
    geographies: z
      .object({
        States: z.array(z.object({ STATE: z.string() })).optional(),
      })
      .passthrough(),
  }),
});

type LocationResult =
  | "in_state"
  | "outside_state"
  | "denied"
  | "unavailable"
  | "indeterminate";

async function verifyWithCensus(latitude: number, longitude: number): Promise<LocationResult> {
  const url = new URL(
    "https://geocoding.geo.census.gov/geocoder/geographies/coordinates",
  );
  url.searchParams.set("x", longitude.toString());
  url.searchParams.set("y", latitude.toString());
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("format", "json");

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "Any-Given-Pick/1.0 (eligibility verification)" },
    });
    if (!response.ok) return "indeterminate";

    const parsed = censusResponseSchema.safeParse(await response.json());
    if (!parsed.success) return "indeterminate";

    const stateFips = parsed.data.result.geographies.States?.[0]?.STATE;
    if (!stateFips) return "indeterminate";
    return stateFips === "18" ? "in_state" : "outside_state";
  } catch {
    return "indeterminate";
  }
}

export async function POST(request: Request) {
  const appUser = await requireAppUser();
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid location result." }, { status: 400 });
  }

  const before = await getAccountSummary(appUser.id);
  const locationResult =
    parsed.data.status === "position"
      ? await verifyWithCensus(parsed.data.latitude, parsed.data.longitude)
      : parsed.data.status;
  const accuracyMeters =
    parsed.data.status === "position" ? Math.round(parsed.data.accuracy) : null;
  const eligible =
    appUser.accountState === "active" &&
    before.verifiedAuth &&
    before.profileComplete &&
    before.ageEligible === true &&
    locationResult === "in_state";
  const reasonCode = eligible
    ? "eligible"
    : locationResult === "in_state"
      ? before.reason
      : `location_${locationResult}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1_000);
  const method =
    parsed.data.status === "position"
      ? "browser_geolocation+census_geographies"
      : "browser_geolocation_status";
  const db = getDb();

  await db.transaction(async (transaction) => {
    await transaction.insert(eligibilityChecks).values({
      userId: appUser.id,
      ageResult: before.ageEligible === true,
      locationResult,
      overallResult: eligible ? "eligible" : "read_only",
      reasonCode,
      accuracyMeters,
      method,
      policyVersion: "prototype-indiana-v1",
      checkedAt: now,
      expiresAt,
    });

    await transaction.insert(auditEvents).values({
      actorUserId: appUser.id,
      targetUserId: appUser.id,
      action: "eligibility.location_checked",
      entityType: "eligibility_check",
      metadata: { locationResult, overallResult: eligible ? "eligible" : "read_only", method },
    });
  });

  const account = await getAccountSummary(appUser.id);
  return NextResponse.json({ account });
}
