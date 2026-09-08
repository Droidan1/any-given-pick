import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireAppUser: vi.fn(),
  getLivePlayerPicks: vi.fn(),
  consumeRateLimit: vi.fn(),
  reportOperationalIssue: vi.fn(),
  resolveOperationalIssue: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/app-user", () => ({ requireAppUser: mocks.requireAppUser }));
vi.mock("@/lib/entries/service", () => ({ getLivePlayerPicks: mocks.getLivePlayerPicks }));
vi.mock("@/lib/security/rate-limit", () => ({ consumeRateLimit: mocks.consumeRateLimit }));
vi.mock("@/lib/monitoring/operational-alerts", () => ({
  reportOperationalIssue: mocks.reportOperationalIssue,
  resolveOperationalIssue: mocks.resolveOperationalIssue,
}));
vi.mock("next/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("next/server")>();
  return { ...original, after: (callback: () => unknown) => callback() };
});

import { GET } from "./route";

const weekId = "11111111-1111-4111-8111-111111111111";

describe("GET /api/picks/live", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "clerk-user" });
    mocks.requireAppUser.mockResolvedValue({ id: "app-user", accountState: "active" });
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.getLivePlayerPicks.mockResolvedValue([]);
    mocks.reportOperationalIssue.mockResolvedValue(undefined);
    mocks.resolveOperationalIssue.mockResolvedValue(undefined);
  });

  it("returns 401 without recording an application error when the session is missing", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await GET(new Request(`https://anygivenpick.app/api/picks/live?weekId=${weekId}`));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign in to refresh live picks." });
    expect(mocks.requireAppUser).not.toHaveBeenCalled();
    expect(mocks.reportOperationalIssue).not.toHaveBeenCalled();
  });

  it("returns players and resolves the stale generic alert after a successful refresh", async () => {
    mocks.getLivePlayerPicks.mockResolvedValue([{ userId: "app-user", displayName: "Napalm", picks: {}, updatedAt: null }]);

    const response = await GET(new Request(`https://anygivenpick.app/api/picks/live?weekId=${weekId}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ players: [{ userId: "app-user" }] });
    expect(mocks.resolveOperationalIssue).toHaveBeenCalledWith("application_error", "/api/picks/live:Error");
  });

  it("returns a retryable 503 and records a sanitized feed error for genuine failures", async () => {
    mocks.getLivePlayerPicks.mockRejectedValue(Object.assign(new Error("connection details"), { code: "ECONNRESET" }));

    const response = await GET(new Request(`https://anygivenpick.app/api/picks/live?weekId=${weekId}`));

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(mocks.reportOperationalIssue).toHaveBeenCalledWith(expect.objectContaining({
      kind: "live_picks_feed_error",
      identity: "ECONNRESET",
      context: expect.objectContaining({ errorCode: "ECONNRESET" }),
    }));
  });
});
