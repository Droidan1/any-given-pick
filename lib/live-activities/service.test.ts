import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: vi.fn(), admin: vi.fn(), send: vi.fn(), clerk: vi.fn(), configured: vi.fn(), scores: vi.fn(), alert: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: mocks.db }));
vi.mock("@/lib/auth/admin", () => ({ hasAdminRole: mocks.admin }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ sessions: { getSession: mocks.clerk } }) }));
vi.mock("@/lib/native-push/apns", () => ({ sendNativePush: mocks.send, apnsConfigured: mocks.configured, APNsDeliveryError: class extends Error {} }));
vi.mock("@/lib/results/service", () => ({ getWeeklyResults: vi.fn() }));
vi.mock("@/lib/scores/health", () => ({ refreshScoreSyncIfDueWithHealth: mocks.scores }));
vi.mock("@/lib/monitoring/operational-alerts", () => ({ reportOperationalIssue: mocks.alert }));
import { liveActivitySessions, contestEntries, contestWeeks, games } from "@/lib/db/schema";
import { runLiveActivities, startPrivateTest, type Device } from "./service";
const now = new Date("2026-09-22T23:00:00Z");
const device = { id: "d", userId: "u", installationId: "i", clerkSessionId: "c", environment: "sandbox", enabled: true,
  authorized: true, deadline: true, race: true, pushToStartToken: "start-token", updatedAt: now } as Device;
const session = { id: "s", deviceId: "d", contestWeekId: "w", gameId: null, kind: "race", sessionKey: "private-test:request",
  status: "pending", startsAt: now, endsAt: new Date(+now + 300_000), updateToken: null as string | null, failureCount: 0, updatedAt: now };

// Queue SQL results without a network/database. Record writes to assert isolation from contest tables.
function database(reads: unknown[][], inserted = session) {
  const writes: { table: unknown; values?: unknown }[] = [];
  function chain(result: unknown[]) {
    const value: Record<string, unknown> = { then: (resolve: (v: unknown[]) => unknown) => Promise.resolve(result).then(resolve) };
    for (const method of ["from", "where", "limit", "for", "orderBy", "innerJoin"]) value[method] = () => value;
    value.returning = () => Promise.resolve(result);
    return value;
  }
  const db = {
    select: vi.fn(() => chain(reads.shift() ?? [])), execute: vi.fn(),
    insert: vi.fn((table: unknown) => ({ values: (values: unknown) => { writes.push({ table, values }); return { ...chain([inserted]), onConflictDoNothing: vi.fn() }; } })),
    update: vi.fn((table: unknown) => ({ set: (values: unknown) => { writes.push({ table, values }); return chain([{ id: session.id }]); } })),
    delete: vi.fn((table: unknown) => { writes.push({ table }); return chain([]); }),
    transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(db),
  };
  mocks.db.mockReturnValue(db);
  return { db, writes };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("LIVE_ACTIVITIES_ENABLED", "true"); mocks.admin.mockResolvedValue(true);
  mocks.configured.mockReturnValue(true); mocks.clerk.mockResolvedValue({ status: "active", userId: "clerk-u" }); mocks.send.mockResolvedValue({});
});
describe("Private test creation", () => {
  it("only inserts a test session with a short window; game starts locally", async () => {
    const { writes } = database([[device], [], [], [{ id: "w" }]], { ...session, kind: "game" });
    const result = await startPrivateTest(device, "game", "request", now);
    expect(result.mode).toBe("local"); expect(result.seed?.attributes.isTest).toBe(true);
    expect(writes).toHaveLength(1); expect(writes[0].table).toBe(liveActivitySessions);
    expect(writes[0].values).toMatchObject({ sessionKey: "private-test:request", startsAt: now, endsAt: session.endsAt });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("queues remote starts twenty seconds ahead and never sends inside the request", async () => {
    const { writes } = database([[device], [], [], [{ id: "w" }]]);
    const result = await startPrivateTest(device, "race", "request", now);
    expect(result).toMatchObject({ mode: "remote", seed: null });
    expect(writes[0].values).toMatchObject({ startsAt: new Date(+now + 20_000), endsAt: new Date(+now + 320_000) });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("reuses a retried request and blocks a second concurrent test", async () => {
    let state = database([[device], [session]]);
    expect((await startPrivateTest(device, "race", "request", now)).sessionId).toBe("s"); expect(state.writes).toEqual([]);
    state = database([[device], [], [session]]);
    await expect(startPrivateTest(device, "race", "another", now)).rejects.toThrow("Stop the current"); expect(state.writes).toEqual([]);
  });
  it("rechecks registration, preferences, sandbox, and push readiness under the lock", async () => {
    for (const changes of [{ environment: "production" }, { authorized: false }, { enabled: false }, { race: false }, { pushToStartToken: null }, { clerkSessionId: "other" }]) {
      const { writes } = database([[{ ...device, ...changes }]]);
      await expect(startPrivateTest(device, "race", "request", now)).rejects.toThrow(); expect(writes).toEqual([]);
    }
  });
});
describe("Private test scheduled delivery", () => {
  function worker(row = session, fresh = device) {
    return database([[], [], [], [row], [device], [{ accountState: "active", clerkUserId: "clerk-u" }], [fresh], [row], []]);
  }
  it("uses the real worker for start, update and end, never writes contest data", async () => {
    for (const event of ["start", "update", "end"]) {
      const row = { ...session, status: event === "start" ? "pending" : "active", updateToken: event === "start" ? null : "update-token",
        endsAt: event === "end" ? now : session.endsAt };
      const { writes } = worker(row);
      await runLiveActivities(now);
      expect(mocks.send).toHaveBeenLastCalledWith(expect.objectContaining({ environment: "sandbox", pushType: "liveactivity",
        deviceToken: event === "start" ? "start-token" : "update-token", payload: expect.objectContaining({ aps: expect.objectContaining({ event }) }) }));
      expect(writes.some(({ table }) => [contestWeeks, contestEntries, games].includes(table as typeof games))).toBe(false);
    }
  });
  it("does not send a start after admin removal or an expired session", async () => {
    mocks.admin.mockResolvedValue(false); worker(); await runLiveActivities(now); expect(mocks.send).not.toHaveBeenCalled();
    mocks.admin.mockResolvedValue(true); worker({ ...session, endsAt: now }); await runLiveActivities(now); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("never remotely starts a manual game test or reroutes a test to production", async () => {
    worker({ ...session, kind: "game" }); await runLiveActivities(now); expect(mocks.send).not.toHaveBeenCalled();
    worker(session, { ...device, environment: "production" }); await runLiveActivities(now); expect(mocks.send).not.toHaveBeenCalled();
  });
});
