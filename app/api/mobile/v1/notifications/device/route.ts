import { auth } from "@clerk/nextjs/server";
import { and, eq, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAppUser } from "@/lib/auth/app-user";
import { getDb } from "@/lib/db";
import { nativePushDevices } from "@/lib/db/schema";
import { apnsConfigured, nativePushEnabled } from "@/lib/native-push/apns";
import { defaultNativePushPreferences, deviceRegistrationSchema, deviceRemovalSchema } from "@/lib/native-push/policy";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers });

async function handle(request: Request) {
  const { userId, sessionId } = await auth();
  if (!userId || !sessionId) return json({ error: "Authentication required." }, 401);
  if (!nativePushEnabled()) return json({ error: "iPhone alerts are being set up. Please try again after the server update." }, 503);
  try {
    const appUser = await requireAppUser(userId);
    const rate = await consumeRateLimit({ scope: "native_push_device", identifier: appUser.id, limit: 120, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) return json({ error: "Too many notification changes. Try again later." }, 429);
    const db = getDb();
    if (request.method === "GET") {
      const query = new URL(request.url).searchParams;
      const parsed = z.object({ installationId: z.uuid(), environment: z.enum(["sandbox", "production"]) })
        .safeParse({ installationId: query.get("installationId"), environment: query.get("environment") });
      if (!parsed.success) return json({ error: "A valid iPhone installation is required." }, 400);
      const [device] = await db.select().from(nativePushDevices).where(and(
        eq(nativePushDevices.installationId, parsed.data.installationId), eq(nativePushDevices.userId, appUser.id),
      )).limit(1);
      return json({
        registered: Boolean(device), deliveryConfigured: apnsConfigured(parsed.data.environment),
        preferences: device ? {
          enabled: device.enabled, weekPublished: device.weekPublished, deadlineApproaching: device.deadlineApproaching,
          picksSubmitted: device.picksSubmitted, resultsAvailable: device.resultsAvailable,
        } : defaultNativePushPreferences,
      });
    }
    if (Number(request.headers.get("content-length")) > 4096) return json({ error: "Request too large." }, 413);
    const body = await request.text();
    if (Buffer.byteLength(body) > 4096) return json({ error: "Request too large." }, 413);
    let input: unknown;
    try { input = JSON.parse(body); } catch { return json({ error: "Invalid notification settings." }, 400); }
    if (request.method === "DELETE") {
      const parsed = deviceRemovalSchema.safeParse(input);
      if (!parsed.success) return json({ error: "Invalid iPhone installation." }, 400);
      await db.delete(nativePushDevices).where(and(
        eq(nativePushDevices.installationId, parsed.data.installationId), eq(nativePushDevices.userId, appUser.id),
      ));
      return json({ ok: true });
    }
    if (appUser.accountState !== "active") return json({ error: "An approved account is required for iPhone alerts." }, 403);
    const parsed = deviceRegistrationSchema.safeParse(input);
    if (!parsed.success) return json({ error: "Invalid notification settings." }, 400);
    const { installationId, deviceToken, environment, preferences } = parsed.data;
    await db.transaction(async (tx) => {
      // Serialize registration so account switches and token rotation cannot leave two owners.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('native_push_registration'))`);
      const matches = await tx.select().from(nativePushDevices).where(or(
        eq(nativePushDevices.installationId, installationId),
        and(eq(nativePushDevices.deviceToken, deviceToken), eq(nativePushDevices.environment, environment)),
      )).for("update");
      const existing = matches.find((row) => row.installationId === installationId && row.userId === appUser.id);
      for (const row of matches) {
        if (row.id !== existing?.id) await tx.delete(nativePushDevices).where(eq(nativePushDevices.id, row.id));
      }
      const values = { userId: appUser.id, clerkSessionId: sessionId, deviceToken, environment, ...preferences, updatedAt: new Date() };
      if (existing) await tx.update(nativePushDevices).set(values).where(eq(nativePushDevices.id, existing.id));
      else await tx.insert(nativePushDevices).values({ installationId, ...values });
    });
    return json({ registered: true, deliveryConfigured: apnsConfigured(environment), preferences });
  } catch {
    return json({ error: "Notification settings could not be saved. Please try again." }, 503);
  }
}

export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
