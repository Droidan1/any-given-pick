import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), admin: vi.fn(), rate: vi.fn(), users: vi.fn(),
  picks: vi.fn(), announcements: vi.fn(), privacy: vi.fn(), alerts: vi.fn(), health: vi.fn(), access: vi.fn(), save: vi.fn(), archive: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/lib/auth/app-user", () => ({ requireAppUser: m.user }));
vi.mock("@/lib/auth/admin", () => ({ hasAdminRole: m.admin }));
vi.mock("@/lib/auth/user-approval", () => ({ isUserApprovalRequired: () => true }));
vi.mock("@/lib/security/rate-limit", () => ({ consumeRateLimit: m.rate }));
vi.mock("@/lib/admin/users", () => ({ listAdminUsers: m.users }));
vi.mock("@/lib/admin/picks", () => ({ getAdminPicksBoard: m.picks }));
vi.mock("@/lib/admin/privacy-requests", () => ({ listPendingPrivacyRequests: m.privacy }));
vi.mock("@/lib/announcements/service", () => ({ listCommissionerAnnouncements: m.announcements }));
vi.mock("@/lib/monitoring/operational-alerts", () => ({ listActiveOperationalAlerts: m.alerts }));
vi.mock("@/lib/scores/health", () => ({ inspectScoreSyncWatchdog: m.health }));
vi.mock("@/app/admin/user-access-actions", () => ({ manageUserAccessAction: m.access }));
vi.mock("@/app/admin/announcement-actions", () => ({ saveCommissionerAnnouncement: m.save, archiveCommissionerAnnouncement: m.archive }));
import { GET, POST } from "./route";
const id = "00000000-0000-4000-8000-000000000001";
const get = (view = "users", extra = "") => GET(new Request(`https://example.test/api/mobile/v1/admin?view=${view}${extra}`, { headers: { Authorization: "Bearer test" } }));
const post = (body: unknown) => POST(new Request("https://example.test/api/mobile/v1/admin", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify(body) }));
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ userId: "clerk-admin", sessionId: "session" });
  m.user.mockResolvedValue({ id: "actor" });
  m.admin.mockResolvedValue(true);
  m.rate.mockResolvedValue({ allowed: true });
  m.users.mockResolvedValue({ users: [], pendingCount: 0 });
  m.access.mockResolvedValue({ status: "success", message: "Player access approved." });
  m.save.mockResolvedValue({ ok: true, message: "Saved." });
  m.archive.mockResolvedValue({ ok: true, message: "Archived." });
});

describe("native admin boundary", () => {
  it("requires a verified session and bearer header", async () => {
    expect((await GET(new Request("https://example.test/api/mobile/v1/admin?view=users"))).status).toBe(401);
    expect(m.auth).not.toHaveBeenCalled();
    m.auth.mockResolvedValue({ userId: "user" });
    expect((await get()).status).toBe(401);
    m.auth.mockResolvedValue({});
    expect((await post({ action: "archive", id })).status).toBe(401);
    expect(m.user).not.toHaveBeenCalled();
  });
  it.each(["users", "announcements", "picks", "operations"])("denies non-admin access to %s", async (view) => {
    m.admin.mockResolvedValue(false);
    expect((await get(view)).status).toBe(403);
    expect(m.users).not.toHaveBeenCalled();
    expect(m.picks).not.toHaveBeenCalled();
    expect(m.announcements).not.toHaveBeenCalled();
    expect(m.health).not.toHaveBeenCalled();
  });
  it("denies writes to non-admins", async () => {
    m.admin.mockResolvedValue(false);
    expect((await post({ action: "access", targetUserId: id, intent: "approve" })).status).toBe(403);
    expect(m.access).not.toHaveBeenCalled();
  });
  it("uses the verified actor and private no-store responses", async () => {
    const response = await get("users", "&userId=forged&isAdmin=true");
    expect(response.status).toBe(200);
    expect(m.users).toHaveBeenCalledWith("actor");
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("vary")).toBe("Authorization");
  });
  it("keeps the existing picks service responsible for deadline visibility", async () => {
    m.picks.mockResolvedValue({ revealStatus: "open", players: [{ userId: id, entry: null }] });
    const response = await get("picks", `&weekId=${id}`);
    expect(m.picks).toHaveBeenCalledWith({ weekId: id, currentUserId: "actor" });
    expect((await response.json()).board.players[0].entry).toBeNull();
  });
  it("rejects bad queries, invalid ids, unknown actions and forged actor fields", async () => {
    expect((await get("secret")).status).toBe(400);
    expect((await get("picks", "&weekId=bad")).status).toBe(400);
    expect((await post({ action: "access", targetUserId: id, intent: "approve", actor: "forged" })).status).toBe(400);
    expect((await post({ action: "deleteAll" })).status).toBe(400);
    expect((await post({ action: "archive", id: "bad" })).status).toBe(400);
    expect(m.access).not.toHaveBeenCalled();
  });
  it("reuses existing approval guards, audit trail and email action", async () => {
    expect((await post({ action: "access", targetUserId: id, intent: "approve" })).status).toBe(200);
    const form = m.access.mock.calls[0][1] as FormData;
    expect(form.get("targetUserId")).toBe(id);
    expect(form.get("intent")).toBe("approve");
    m.access.mockResolvedValue({ status: "error", message: "Administrator accounts are protected." });
    expect(await (await post({ action: "access", targetUserId: id, intent: "remove" })).json()).toEqual({ ok: false, message: "Administrator accounts are protected." });
  });
  it("preserves announcement validation and publication conflict messages", async () => {
    const command = { action: "announcement", title: "Weekly update", body: "Remember to submit your card.", startsAt: "2026-09-24T12:00:00Z", expiresAt: "", intent: "publish" };
    m.save.mockResolvedValue({ ok: false, message: "Another announcement overlaps." });
    expect(await (await post(command)).json()).toEqual({ ok: false, message: "Another announcement overlaps." });
    expect(m.save).toHaveBeenCalledWith({ title: command.title, body: command.body, startsAt: command.startsAt, expiresAt: "", intent: "publish" });
    expect((await post({ ...command, title: "a" })).status).toBe(400);
    await post({ action: "archive", id });
    expect(m.archive).toHaveBeenCalledWith(id);
  });
  it("reads monitoring status without executing a sync or watchdog alerts", async () => {
    m.health.mockResolvedValue({ ready: false, health: { status: "warning" } });
    m.alerts.mockResolvedValue([]);
    m.privacy.mockResolvedValue([]);
    expect((await get("operations")).status).toBe(200);
    expect(m.health).toHaveBeenCalledTimes(1);
  });
  it("limits requests and body sizes", async () => {
    m.rate.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    const limited = await post({ action: "archive", id });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("30");
    expect(m.archive).not.toHaveBeenCalled();
    m.rate.mockResolvedValue({ allowed: true });
    expect((await post({ body: "a".repeat(9000) })).status).toBe(413);
  });
  it("handles malformed JSON and late auth revocation without leaking internal errors", async () => {
    const response = await POST(new Request("https://example.test", { method: "POST", headers: { Authorization: "Bearer test" }, body: "{" }));
    expect(response.status).toBe(400);
    m.archive.mockRejectedValue(new Error("ADMIN_REQUIRED"));
    expect((await post({ action: "archive", id })).status).toBe(403);
    m.users.mockRejectedValue(new Error("secret connection details"));
    const failed = await get();
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("secret connection");
  });
});
