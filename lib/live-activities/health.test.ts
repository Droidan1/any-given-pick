import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: mocks.db }));
vi.mock("@/lib/native-push/apns", () => ({ apnsConfigured: () => true }));
import { heartbeatReady, inspectLiveActivityHealth } from "./health";
const now = new Date("2026-09-22T20:00:00Z");
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("Live Activity scheduler heartbeat", () => {
  it("does not read the database while rollout is disabled", async () => {
    vi.stubEnv("LIVE_ACTIVITIES_ENABLED", "false");
    expect(await inspectLiveActivityHealth(now)).toBe("disabled");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("accepts a recent completed pass, including an overlapping running pass", () => {
    expect(heartbeatReady({ status: "healthy", lastSuccessAt: now }, now)).toBe(true);
    expect(heartbeatReady({ status: "running", lastSuccessAt: new Date(now.getTime() - 60_000) }, now)).toBe(true);
  });
  it("detects never-started, failed, stale, and invalid future heartbeats", () => {
    expect(heartbeatReady(undefined, now)).toBe(false);
    expect(heartbeatReady({ status: "healthy", lastSuccessAt: null }, now)).toBe(false);
    expect(heartbeatReady({ status: "failed", lastSuccessAt: now }, now)).toBe(false);
    expect(heartbeatReady({ status: "healthy", lastSuccessAt: new Date(now.getTime() - 300_001) }, now)).toBe(false);
    expect(heartbeatReady({ status: "healthy", lastSuccessAt: new Date(now.getTime() + 60_001) }, now)).toBe(false);
  });
  it("fails closed without exposing database error details", async () => {
    vi.stubEnv("LIVE_ACTIVITIES_ENABLED", "true"); mocks.db.mockImplementation(() => { throw new Error("private database details"); });
    expect(await inspectLiveActivityHealth(now)).toBe("unavailable");
  });
});
