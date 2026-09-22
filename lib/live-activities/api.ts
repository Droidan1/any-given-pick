import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth/app-user";
import { hasAdminRole } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import { liveActivityDevices as devices, liveActivitySessions as sessions } from "@/lib/db/schema";
import { apnsConfigured, type APNsEnvironment } from "@/lib/native-push/apns";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { activityUpdateSchema, defaultPreferences, followSchema, installationSchema, registrationSchema, stopSchema } from "./policy";
import { followGame, liveActivitiesEnabled, ownedDevice, sessionList, startPrivateTest, stopDevice, LiveActivityInputError } from "./service";
import { privateTestAllowed, privateTestSchema } from "./private-test";

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export function activityHandler(resource: "device" | "session" | "test") {
  return async (request: Request) => {
    const { userId, sessionId } = await auth();
    if (!userId || !sessionId) return json({ error: "Authentication required." }, 401);
    if (!liveActivitiesEnabled()) return json({ error: "Live Activities are not enabled on this server yet." }, 503);
    try {
      const user = await requireAppUser(userId);
      const rate = await consumeRateLimit({ scope: "live_activity_settings", identifier: user.id, limit: 300, windowMs: 60 * 60 * 1000 });
      if (!rate.allowed) return json({ error: "Too many updates. Try again shortly." }, 429);
      const db = getDb();
      if (request.method === "GET" && resource === "device") {
        const parsed = installationSchema.safeParse({ installationId: new URL(request.url).searchParams.get("installationId") });
        if (!parsed.success) return json({ error: "Invalid installation." }, 400);
        const device = await ownedDevice(parsed.data.installationId, user.id);
        return json({ registered: Boolean(device), deliveryConfigured: device ? apnsConfigured(device.environment as APNsEnvironment) : false,
          canTest: privateTestAllowed(user.accountState, device?.environment === "sandbox" && await hasAdminRole(user.id), device?.environment),
          preferences: device ? { enabled: device.enabled, deadline: device.deadline, race: device.race } : defaultPreferences,
          sessions: device ? await sessionList(device.id) : [] });
      }
      if (Number(request.headers.get("content-length")) > 8192) return json({ error: "Request too large." }, 413);
      const text = await request.text();
      if (Buffer.byteLength(text) > 8192) return json({ error: "Request too large." }, 413);
      let input: unknown;
      try { input = JSON.parse(text); } catch { return json({ error: "Invalid request." }, 400); }
      if (request.method === "DELETE" && resource === "device") {
        const parsed = installationSchema.safeParse(input);
        if (!parsed.success) return json({ error: "Invalid installation." }, 400);
        const device = await ownedDevice(parsed.data.installationId, user.id);
        if (device) await stopDevice(device);
        return json({ ok: true });
      }
      if (user.accountState !== "active") return json({ error: "An approved account is required." }, 403);
      if (resource === "test") {
        if (!(await hasAdminRole(user.id))) return json({ error: "Private tests are restricted to administrators." }, 403);
        const parsed = privateTestSchema.safeParse(input);
        if (!parsed.success) return json({ error: "Invalid private test request." }, 400);
        const device = await ownedDevice(parsed.data.installationId, user.id);
        if (!device || !privateTestAllowed(user.accountState, true, device.environment)) return json({ error: "Use your own registered Xcode sandbox build." }, 403);
        const testRate = await consumeRateLimit({ scope: "live_activity_private_test", identifier: user.id, limit: 12, windowMs: 60 * 60 * 1000 });
        if (!testRate.allowed) return json({ error: "Private test limit reached. Try again in an hour." }, 429);
        try { return json(await startPrivateTest(device, parsed.data.kind, parsed.data.requestId)); }
        catch (error) { return json({ error: error instanceof LiveActivityInputError ? error.message : "Unable to start the private test." }, error instanceof LiveActivityInputError ? 409 : 503); }
      }
      if (resource === "device" && request.method === "PUT") {
        const parsed = registrationSchema.safeParse(input);
        if (!parsed.success) return json({ error: "Invalid Live Activity settings." }, 400);
        const { installationId, environment, authorized, pushToStartToken, preferences } = parsed.data;
        await db.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext('live_activity_registration'))`);
          const matches = await tx.select().from(devices).where(or(eq(devices.installationId, installationId),
            ...(pushToStartToken ? [and(eq(devices.environment, environment), eq(devices.pushToStartToken, pushToStartToken))] : []))).for("update");
          const existing = matches.find((device) => device.installationId === installationId && device.userId === user.id);
          for (const row of matches) if (row.id !== existing?.id) await tx.delete(devices).where(eq(devices.id, row.id));
          const values = { installationId, userId: user.id, clerkSessionId: sessionId, environment, authorized, pushToStartToken, ...preferences, updatedAt: new Date() };
          if (existing) await tx.update(devices).set(values).where(eq(devices.id, existing.id));
          else await tx.insert(devices).values(values);
          if (existing) {
            const disabledKinds = !preferences.enabled || !authorized ? ["deadline", "race", "game"]
              : [ ...(!preferences.deadline ? ["deadline"] : []), ...(!preferences.race ? ["race"] : []) ];
            if (disabledKinds.length) await tx.update(sessions).set({ status: "ending", updatedAt: new Date() })
              .where(and(eq(sessions.deviceId, existing.id), inArray(sessions.kind, disabledKinds), inArray(sessions.status, ["pending", "starting", "active"])));
          }
        });
        const device = await ownedDevice(installationId, user.id);
        return json({ registered: true, deliveryConfigured: apnsConfigured(environment),
          canTest: privateTestAllowed(user.accountState, environment === "sandbox" && await hasAdminRole(user.id), environment),
          preferences, sessions: device ? await sessionList(device.id) : [] });
      }
      const parsed = request.method === "POST" ? followSchema.safeParse(input)
        : request.method === "PUT" ? activityUpdateSchema.safeParse(input) : stopSchema.safeParse(input);
      if (!parsed.success) return json({ error: "Invalid Live Activity request." }, 400);
      const device = await ownedDevice(parsed.data.installationId, user.id);
      if (!device) return json({ error: "Enable Live Activities on this iPhone first." }, 409);
      if (request.method === "POST" && "gameId" in parsed.data) {
        if (!device.enabled || !device.authorized) return json({ error: "Enable Live Activities on this iPhone first." }, 409);
        try { return json(await followGame(device, parsed.data.gameId)); }
        catch (error) { return json({ error: error instanceof LiveActivityInputError ? error.message : "Unable to follow this game." }, error instanceof LiveActivityInputError ? 409 : 503); }
      }
      if (!("sessionId" in parsed.data)) return json({ error: "Invalid session." }, 400);
      const [session] = await db.select().from(sessions).where(and(eq(sessions.id, parsed.data.sessionId), eq(sessions.deviceId, device.id))).limit(1);
      if (!session) return json({ error: "Activity not found for this account." }, 404);
      if (request.method === "DELETE") {
        await db.update(sessions).set({ status: session.updateToken ? "ending" : "dismissed", updatedAt: new Date() }).where(eq(sessions.id, session.id));
        return json({ ok: true });
      }
      const update = activityUpdateSchema.parse(input);
      if (update.status === "active") {
        if (!device.enabled || !device.authorized || session.endsAt <= new Date() || ["ended", "dismissed", "ending"].includes(session.status)) return json({ error: "This activity has ended." }, 409);
        if (!update.updateToken) return json({ error: "An update token is required." }, 400);
        if (session.activityId && session.activityId !== update.activityId) return json({ error: "An activity is already registered." }, 409);
        await db.update(sessions).set({ status: "active", activityId: update.activityId, updateToken: update.updateToken, updatedAt: new Date() })
          .where(and(eq(sessions.id, session.id), inArray(sessions.status, ["pending", "starting", "active"])));
      } else {
        await db.update(sessions).set({ status: update.status, updateToken: null, updatedAt: new Date() }).where(eq(sessions.id, session.id));
      }
      return json({ ok: true });
    } catch { return json({ error: "Live Activities could not be updated. Please try again." }, 503); }
  };
}
