import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), account: vi.fn(), admin: vi.fn(), week: vi.fn(), results: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/app-user", () => ({ requireAppUser: mocks.user }));
vi.mock("@/lib/auth/admin", () => ({ hasAdminRole: mocks.admin }));
vi.mock("@/lib/eligibility/service", () => ({ getAccountSummary: mocks.account }));
vi.mock("@/lib/entries/service", () => ({ getCurrentPlayerWeek: mocks.week }));
vi.mock("@/lib/results/service", () => ({ getWeeklyResults: mocks.results }));
import { GET } from "./route";
const weekId = "00000000-0000-4000-8000-000000000001";
const call = (query = "") => GET(new Request(`https://example.test/api/mobile/v1/bootstrap${query}`));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "clerk-user" });
  mocks.user.mockResolvedValue({ id: "app-user" });
  mocks.account.mockResolvedValue({ accountState: "active", displayName: "Player" });
  mocks.admin.mockResolvedValue(false);
  mocks.week.mockResolvedValue({ id: weekId, games: Array.from({ length: 16 }, (_, i) => ({ id: `game-${i}` })) });
  mocks.results.mockResolvedValue({ entries: [] });
});
describe("Native home bootstrap", () => {
  it("keeps the existing full bootstrap contract", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(mocks.week).toHaveBeenCalledWith("app-user", { includeLivePicks: true });
    expect(mocks.results).toHaveBeenCalledWith({ currentUserId: "app-user" });
  });
  it("returns all games without reloading other players or results", async () => {
    const response = await call("?view=home");
    const body = await response.json();
    expect(body.currentWeek.games).toHaveLength(16);
    expect(body.results).toBeNull();
    expect(mocks.week).toHaveBeenCalledWith("app-user", { includeLivePicks: false });
    expect(mocks.results).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("private, no-store");
  });
  it("scopes the requested week to the signed-in user", async () => {
    await call(`?view=home&weekId=${weekId}&userId=another-user`);
    expect(mocks.week).toHaveBeenCalledWith("app-user", { includeLivePicks: false, weekId });
  });
  it("rejects invalid week ids and never silently substitutes a missing week", async () => {
    expect((await call("?view=home&weekId=bad")).status).toBe(400);
    expect(mocks.week).not.toHaveBeenCalled();
    mocks.week.mockResolvedValue(null);
    expect((await call(`?view=home&weekId=${weekId}`)).status).toBe(404);
  });
  it("does not return player data to signed-out or unapproved accounts", async () => {
    mocks.auth.mockResolvedValue({});
    expect((await call("?view=home")).status).toBe(401);
    expect(mocks.user).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({ userId: "clerk-user" });
    mocks.account.mockResolvedValue({ accountState: "pending" });
    expect(await (await call("?view=home")).json()).toMatchObject({ currentWeek: null, results: null });
    expect(mocks.week).not.toHaveBeenCalled();
  });
  it("keeps internal errors private and tells clients to back off", async () => {
    mocks.week.mockRejectedValue(new Error("private database details"));
    const response = await call("?view=home");
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("15");
    expect(await response.text()).not.toContain("private database details");
  });
});
