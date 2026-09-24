import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminRole } from "@/lib/auth/admin";
import { requireAppUser } from "@/lib/auth/app-user";
import { isUserApprovalRequired } from "@/lib/auth/user-approval";
import { listAdminUsers } from "@/lib/admin/users";
import { getAdminPicksBoard } from "@/lib/admin/picks";
import { listPendingPrivacyRequests } from "@/lib/admin/privacy-requests";
import { listCommissionerAnnouncements } from "@/lib/announcements/service";
import { listActiveOperationalAlerts } from "@/lib/monitoring/operational-alerts";
import { inspectScoreSyncWatchdog } from "@/lib/scores/health";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { manageUserAccessAction } from "@/app/admin/user-access-actions";
import { archiveCommissionerAnnouncement, saveCommissionerAnnouncement } from "@/app/admin/announcement-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const querySchema = z.object({ view: z.enum(["users", "announcements", "picks", "operations"]), weekId: z.uuid().optional() });
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("access"), targetUserId: z.uuid(), intent: z.enum(["approve", "remove"]) }).strict(),
  z.object({ action: z.literal("archive"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("announcement"), id: z.uuid().optional(), title: z.string().trim().min(3).max(80),
    body: z.string().trim().min(3).max(500), startsAt: z.iso.datetime({ offset: true }),
    expiresAt: z.union([z.literal(""), z.iso.datetime({ offset: true })]), intent: z.enum(["save_draft", "publish"]) }).strict(),
]);

async function handle(request: Request) {
  try {
    // Native callers send a Clerk session bearer token. Never accept an actor or role from the body.
    if (!/^Bearer\s+\S+$/i.test(request.headers.get("authorization") ?? "")) return json({ error: "Authentication required." }, 401);
    const { userId, sessionId } = await auth();
    if (!userId || !sessionId) return json({ error: "Authentication required." }, 401);
    const actor = await requireAppUser(userId);
    if (!(await hasAdminRole(actor.id))) return json({ error: "Administrator access required." }, 403);
    const rate = await consumeRateLimit({ scope: request.method === "GET" ? "mobile_admin_read" : "mobile_admin_write",
      identifier: actor.id, limit: request.method === "GET" ? 120 : 30, windowMs: 60_000 });
    if (!rate.allowed) return NextResponse.json({ error: "Too many admin requests. Try again shortly." },
      { status: 429, headers: { ...headers, "Retry-After": String(rate.retryAfterSeconds) } });

    if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      const query = querySchema.safeParse({ view: params.get("view"), weekId: params.get("weekId") ?? undefined });
      if (!query.success) return json({ error: "Invalid admin view or week." }, 400);
      switch (query.data.view) {
        case "users": return json({ directory: await listAdminUsers(actor.id), approvalRequired: isUserApprovalRequired() });
        case "announcements": return json({ announcements: await listCommissionerAnnouncements() });
        case "picks": return json({ board: await getAdminPicksBoard({ currentUserId: actor.id, weekId: query.data.weekId }) });
        case "operations": {
          // Reading the admin monitor must not send watchdog emails or trigger a score sync.
          const [scoreSync, alerts, privacyRequests] = await Promise.all([
            inspectScoreSyncWatchdog(), listActiveOperationalAlerts(), listPendingPrivacyRequests(),
          ]);
          return json({ operations: { scoreSync, alerts, privacyRequests, alertEmailEnabled: Boolean(process.env.RESEND_API_KEY) } });
        }
      }
    }
    if (Number(request.headers.get("content-length")) > 8192) return json({ error: "Request too large." }, 413);
    const text = await request.text();
    if (Buffer.byteLength(text) > 8192) return json({ error: "Request too large." }, 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return json({ error: "Invalid request." }, 400); }
    const parsed = commandSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Check the fields and try again." }, 400);
    const command = parsed.data;
    // Reuse the web mutations, including their own authorization, protected admins,
    // transactions, audit history, publication rules, revalidation and approval email.
    if (command.action === "access") {
      const form = new FormData();
      form.set("targetUserId", command.targetUserId);
      form.set("intent", command.intent);
      const result = await manageUserAccessAction({ status: "idle", message: "" }, form);
      return json({ ok: result.status === "success", message: result.message });
    }
    if (command.action === "archive") return json(await archiveCommissionerAnnouncement(command.id));
    return json(await saveCommissionerAnnouncement({
      id: command.id,
      intent: command.intent,
      title: command.title,
      body: command.body,
      startsAt: command.startsAt,
      expiresAt: command.expiresAt,
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return json({ error: "Sign in again to continue." }, 401);
    if (error instanceof Error && error.message === "ADMIN_REQUIRED") return json({ error: "Administrator access required." }, 403);
    return NextResponse.json({ error: request.method === "GET" ? "Admin data could not be loaded. Try again." : "The result could not be confirmed. Refresh before trying again." },
      { status: 503, headers: { ...headers, "Retry-After": "15" } });
  }
}

export const GET = handle;
export const POST = handle;
