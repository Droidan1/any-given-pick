import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ run: vi.fn(), readiness: vi.fn(), heartbeat: vi.fn() }));
vi.mock("@/lib/live-activities/service", () => ({ runLiveActivities: mocks.run }));
vi.mock("@/lib/live-activities/health", () => ({ liveActivityReadiness: mocks.readiness, recordLiveActivityHeartbeat: mocks.heartbeat }));
import { GET } from "@/app/api/cron/live-activities/route";
function request(suffix = "", authorized = true) {
  return new Request(`https://example.test/api/cron/live-activities${suffix}`, { headers: authorized ? { Authorization: "Bearer test-secret" } : {} });
}
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", "test-secret"); vi.stubEnv("LIVE_ACTIVITIES_ENABLED", "true"); vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("Live Activity release diagnostics", () => {
  it("requires the cron secret even for diagnostics", async () => {
    expect((await GET(request("?check=1", false))).status).toBe(401);
    expect(mocks.readiness).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled();
  });
  it("checks readiness without sending or updating the heartbeat", async () => {
    mocks.readiness.mockResolvedValue({ schemaReady: true, sandboxConfigured: true });
    const response = await GET(request("?check=1"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.heartbeat).not.toHaveBeenCalled();
  });
  it("reports a missing migration or failed diagnostic without claiming worker failure", async () => {
    mocks.readiness.mockResolvedValue({ schemaReady: false }); expect((await GET(request("?check=1"))).status).toBe(503);
    mocks.readiness.mockRejectedValue(new Error("private details")); const response = await GET(request("?check=1"));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private details");
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });
  it("leaves a disabled rollout untouched", async () => {
    mocks.run.mockResolvedValue({ enabled: false, processed: 0, failed: 0 });
    expect((await GET(request())).status).toBe(200); expect(mocks.heartbeat).not.toHaveBeenCalled();
  });
  it("records successful, partially failed, and crashed ticks", async () => {
    mocks.run.mockResolvedValue({ enabled: true, processed: 1, failed: 0 });
    expect((await GET(request())).status).toBe(200); expect(mocks.heartbeat).toHaveBeenLastCalledWith(false);
    mocks.run.mockResolvedValue({ enabled: true, processed: 0, failed: 1 });
    expect((await GET(request())).status).toBe(503); expect(mocks.heartbeat).toHaveBeenLastCalledWith(true);
    mocks.run.mockRejectedValue(new Error("private details"));
    expect((await GET(request())).status).toBe(503); expect(mocks.heartbeat).toHaveBeenLastCalledWith(true);
  });
});
