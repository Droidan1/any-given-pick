import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ cycle: vi.fn(), readiness: vi.fn() }));
vi.mock("@/lib/email/notification-cycle", () => ({ runEmailNotificationCycle: mock.cycle }));
vi.mock("@/lib/email/notification-readiness", () => ({ inspectNotificationReadiness: mock.readiness }));
import { GET } from "./route";

function request(query = "", secret = "test-cron-secret") {
  return new Request(`https://example.test/api/cron/emails${query}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  mock.readiness.mockResolvedValue({ dryRun: true, database: "ready", notificationsSent: 0 });
  mock.cycle.mockResolvedValue({ failed: 0, sent: 1 });
});
afterEach(() => vi.unstubAllEnvs());

describe("scheduled notification endpoint", () => {
  it("requires authorization for dry-run as well as real delivery", async () => {
    for (const query of ["", "?dryRun=true"]) {
      expect((await GET(request(query, "wrong"))).status).toBe(401);
    }
    expect(mock.cycle).not.toHaveBeenCalled();
    expect(mock.readiness).not.toHaveBeenCalled();
  });
  it("fails closed when the cron secret is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request("?dryRun=true"))).status).toBe(503);
    expect(mock.readiness).not.toHaveBeenCalled();
  });
  it("never executes the delivery cycle in dry-run mode", async () => {
    const response = await GET(request("?dryRun=true"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ dryRun: true, database: "ready", notificationsSent: 0 });
    expect(mock.cycle).not.toHaveBeenCalled();
  });
  it("rejects malformed dry-run values instead of accidentally sending", async () => {
    expect((await GET(request("?dryRun=1"))).status).toBe(400);
    expect(mock.cycle).not.toHaveBeenCalled();
  });
  it("keeps both scheduled modes connected to the full cycle", async () => {
    for (const query of ["", "?dryRun=false"]) expect((await GET(request(query))).status).toBe(200);
    expect(mock.cycle).toHaveBeenCalledTimes(2);
    expect(mock.readiness).not.toHaveBeenCalled();
  });
  it("returns a retryable failure without leaking exception details", async () => {
    mock.readiness.mockRejectedValue(new Error("private connection string"));
    const response = await GET(request("?dryRun=true"));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("private connection string");
    expect(mock.cycle).not.toHaveBeenCalled();
  });
  it("lets the scheduler retry failed real deliveries", async () => {
    mock.cycle.mockResolvedValue({ failed: 1 });
    expect((await GET(request())).status).toBe(502);
  });
});
