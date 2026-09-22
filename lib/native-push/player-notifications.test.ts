import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mock = vi.hoisted(() => ({ db: vi.fn(), enabled: vi.fn(), configured: vi.fn(), send: vi.fn(), clerk: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: mock.db }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: mock.clerk }));
vi.mock("./apns", () => ({ nativePushEnabled: mock.enabled, apnsConfigured: mock.configured, sendNativePush: mock.send }));
vi.mock("@/lib/monitoring/operational-alerts", () => ({ reportOperationalIssue: vi.fn() }));
import { queueAvailableNativeResults, queueNativeSubmission, queueNativeWeekPublished, runNativePushCycle } from "./player-notifications";
import { nativePushDeliveries } from "@/lib/db/schema";

const now = new Date("2026-09-29T03:00:00Z");
const week = { id: "week-1", status: "locked", entryDeadline: new Date("2026-09-24T22:00:00Z"), publishedAt: new Date("2026-09-22T12:00:00Z") };
const recipient = { device: { id: "phone-1", userId: "player-1", environment: "sandbox", createdAt: new Date("2026-09-20T12:00:00Z") }, entry: { currentVersionNumber: 1 } };
type QueuedDelivery = { kind: string; dedupeKey: string; deviceId: string; userId: string; contestWeekId: string; entryVersionId?: string };
let batches: unknown[][];
let inserted: QueuedDelivery[];
let conditions: SQL[];
let dedupeTargets: unknown[];
let seen: Set<string>;

function selectChain(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  const chain = {
    from: () => chain, innerJoin: () => chain, leftJoin: () => chain,
    where: (condition: SQL) => { conditions.push(condition); return chain; },
    orderBy: () => chain, limit: () => chain, for: () => chain,
    then: promise.then.bind(promise),
  };
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks(); batches = []; inserted = []; conditions = []; dedupeTargets = []; seen = new Set();
  mock.enabled.mockReturnValue(true); mock.configured.mockReturnValue(true);
  mock.db.mockReturnValue({
    select: () => {
      const rows = batches.shift();
      if (!rows) throw new Error("Unexpected query in notification test");
      return selectChain(rows);
    },
    insert: () => ({ values: (rows: QueuedDelivery[]) => ({
      onConflictDoNothing: ({ target }: { target: unknown }) => {
        dedupeTargets.push(target);
        const fresh = rows.filter((row) => !seen.has(row.dedupeKey));
        for (const row of fresh) { seen.add(row.dedupeKey); inserted.push(row); }
        return { returning: async () => fresh.map((row) => ({ id: row.dedupeKey })) };
      },
    }) }),
    // Worker claiming is isolated: these tests exercise event eligibility/queueing only.
    transaction: async (fn: (tx: unknown) => unknown) => fn({ select: () => selectChain([]) }),
  });
});

describe("automatic native notification events", () => {
  it("queues a settled week once even when the event is checked repeatedly", async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      batches.push([{ weekId: week.id, gameStatus: "final" }, { weekId: week.id, gameStatus: "canceled" }], [week], [recipient]);
      expect(await queueAvailableNativeResults(now)).toBe(attempt === 0 ? 1 : 0);
    }
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ kind: "results_available", dedupeKey: "results_available:week-1:phone-1:" });
    expect(dedupeTargets).toEqual([nativePushDeliveries.dedupeKey, nativePushDeliveries.dedupeKey]);
    expect(batches).toHaveLength(0);
  });

  it.each([["final", "in_progress"], ["final", "scheduled"], ["final", "postponed"], ["canceled"], []])(
    "does not announce an unfinished or entirely canceled slate: %j", async (...statuses: string[]) => {
      batches.push(statuses.map((gameStatus) => ({ weekId: week.id, gameStatus })));
      expect(await queueAvailableNativeResults(now)).toBe(0);
      expect(inserted).toHaveLength(0);
    },
  );

  it("does not replay old results to a newly enrolled phone or a draft-only player", async () => {
    batches.push([{ weekId: week.id, gameStatus: "final" }], [week], [
      { ...recipient, device: { ...recipient.device, createdAt: now } },
      { ...recipient, entry: { currentVersionNumber: 0 } },
    ]);
    expect(await queueAvailableNativeResults(now)).toBe(0);
  });

  it("queries only recent published/locked/final weeks and enabled opted-in active recipients", async () => {
    batches.push([{ weekId: week.id, gameStatus: "final" }], [week], [recipient]);
    await queueAvailableNativeResults(now);
    const queries = conditions.map((condition) => new PgDialect().sqlToQuery(condition));
    expect(queries[0].params).toEqual(expect.arrayContaining(["published", "locked", "final", now.toISOString(), new Date(now.getTime() - 14 * 86400_000).toISOString()]));
    expect(queries[2].sql).toContain('"results_available"');
    expect(queries[2].sql).toContain('"enabled"');
    expect(queries[2].params).toEqual(expect.arrayContaining([true, "active"]));
  });

  it("keeps results opt-in disabled when APNs is disabled or this environment is unconfigured", async () => {
    mock.enabled.mockReturnValue(false);
    expect(await queueAvailableNativeResults(now)).toBe(0);
    expect(mock.db).not.toHaveBeenCalled();
    mock.enabled.mockReturnValue(true); mock.configured.mockReturnValue(false);
    batches.push([{ weekId: week.id, gameStatus: "final" }], [week], [recipient]);
    expect(await queueAvailableNativeResults(now)).toBe(0);
  });

  it("preserves the immediate publication and version-specific submission hooks", async () => {
    batches.push([week], [recipient]);
    expect((await queueNativeWeekPublished(week.id)).queued).toBe(1);
    batches.push([{ id: "version-1", committedAt: week.entryDeadline }], [week], [recipient]);
    expect((await queueNativeSubmission({ weekId: week.id, userId: recipient.device.userId, submissionKey: "submission-1" })).queued).toBe(1);
    expect(inserted.map((row) => row.kind)).toEqual(["week_published", "picks_submitted"]);
    expect(inserted[1].entryVersionId).toBe("version-1");
    expect(mock.send).not.toHaveBeenCalled();
  });

  it("hourly recovery covers publication, unsubmitted deadlines, results, and missed submissions", async () => {
    const upcoming = { ...week, id: "next-week", status: "published", entryDeadline: new Date(now.getTime() + 3600_000), publishedAt: new Date(now.getTime() - 3600_000) };
    batches.push(
      [upcoming, week],
      [upcoming], [recipient], // publication
      [upcoming], [{ ...recipient, entry: null }, recipient], // deadline: only the unsubmitted entry
      [{ weekId: week.id, gameStatus: "final" }], [week], [recipient], // results
      [{ version: { id: "version-1", committedAt: now }, entry: { contestWeekId: upcoming.id, userId: recipient.device.userId } }],
      [upcoming], [recipient], // submission recovery
    );
    const summary = await runNativePushCycle(now);
    expect(summary.queued).toBe(4);
    expect(inserted.map((row) => row.kind)).toEqual(["week_published", "deadline_approaching", "results_available", "picks_submitted"]);
    expect(batches).toHaveLength(0);
    expect(mock.send).not.toHaveBeenCalled();
    expect(mock.clerk).not.toHaveBeenCalled();
  });
});
