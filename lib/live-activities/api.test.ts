import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), rate: vi.fn(), enabled: vi.fn(), owned: vi.fn(), follow: vi.fn(), stop: vi.fn(), db: vi.fn(), list: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/app-user", () => ({ requireAppUser: mocks.user }));
vi.mock("@/lib/security/rate-limit", () => ({ consumeRateLimit: mocks.rate }));
vi.mock("@/lib/db", () => ({ getDb: mocks.db }));
vi.mock("@/lib/native-push/apns", () => ({ apnsConfigured: () => true }));
vi.mock("./service", () => ({ liveActivitiesEnabled: mocks.enabled, ownedDevice: mocks.owned, followGame: mocks.follow, stopDevice: mocks.stop, sessionList: mocks.list, LiveActivityInputError: class extends Error {} }));
import { activityHandler } from "./api";
const installationId = "00000000-0000-4000-8000-000000000001";
const gameId = "00000000-0000-4000-8000-000000000002";
const call = (resource: "device" | "session", method: string, body?: unknown) => activityHandler(resource)(new Request(`https://example.test/api/mobile/v1/live-activities/${resource}?installationId=${installationId}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ userId: "clerk-a", sessionId: "session-a" });
  mocks.user.mockResolvedValue({ id: "app-a", accountState: "active" }); mocks.enabled.mockReturnValue(true);
  mocks.rate.mockResolvedValue({ allowed: true }); mocks.db.mockReturnValue({}); mocks.owned.mockResolvedValue(undefined); mocks.list.mockResolvedValue([]);
});
describe("Live Activity API security", () => {
  it("rejects unauthenticated access before reading data", async () => {
    mocks.auth.mockResolvedValue({}); expect((await call("device", "GET")).status).toBe(401); expect(mocks.db).not.toHaveBeenCalled();
  });
  it("stays fail-closed before rollout or migration", async () => {
    mocks.enabled.mockReturnValue(false); expect((await call("device", "GET")).status).toBe(503); expect(mocks.db).not.toHaveBeenCalled();
  });
  it("scopes reads to the authenticated account, not supplied ownership fields", async () => {
    const response = await call("device", "GET");
    expect(mocks.owned).toHaveBeenCalledWith(installationId, "app-a");
    expect(await response.json()).toMatchObject({ registered: false, preferences: { enabled: false }, sessions: [] });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects unapproved users and rate-limited requests", async () => {
    mocks.user.mockResolvedValue({ id: "app-a", accountState: "suspended" });
    expect((await call("session", "POST", { installationId, gameId })).status).toBe(403);
    mocks.rate.mockResolvedValue({ allowed: false });
    expect((await call("device", "GET")).status).toBe(429);
  });
  it("does not allow following or updating another account's installation", async () => {
    expect((await call("session", "POST", { installationId, gameId })).status).toBe(409);
    expect(mocks.follow).not.toHaveBeenCalled();
    expect((await call("device", "DELETE", { installationId })).status).toBe(200);
    expect(mocks.stop).not.toHaveBeenCalled();
  });
  it("rejects injected keys and oversized bodies before starting a game", async () => {
    expect((await call("session", "POST", { installationId, gameId, userId: "victim" })).status).toBe(400);
    expect((await call("session", "POST", { installationId, gameId, junk: "x".repeat(8192) })).status).toBe(413);
    expect(mocks.follow).not.toHaveBeenCalled();
  });
  it("does not disclose internal DB or provider errors", async () => {
    mocks.owned.mockResolvedValue({ id: "device", enabled: true, authorized: true });
    mocks.follow.mockRejectedValue(new Error("internal token data must stay private"));
    const response = await call("session", "POST", { installationId, gameId });
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("internal token");
  });
});
