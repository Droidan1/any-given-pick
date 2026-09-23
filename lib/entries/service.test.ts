import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as unknown[][] }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ select: () => {
  const query = {
    from: () => query, innerJoin: () => query, leftJoin: () => query,
    where: () => query, orderBy: () => query, limit: () => query,
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(state.rows.shift() ?? []).then(resolve),
  };
  return query;
} }) }));

import { getLivePlayerPicks } from "./service";

const week = { id: "week", status: "published", entryDeadline: new Date("2026-09-28T22:00:00Z") };
const player = {
  userId: "player", displayName: "Example player", picks: { game: "KC" }, mondayPrediction: 51,
  officialVersionId: "v2", officialMondayPrediction: 45,
  committedAt: new Date("2026-09-27T18:00:00Z"), updatedAt: new Date("2026-09-28T20:00:00Z"),
};

describe("shared picks and Monday totals", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-28T21:00:00Z")); state.rows = []; });
  afterEach(() => vi.useRealTimers());

  it("shares the latest saved total, including zero, before lock", async () => {
    state.rows = [[week], [{ ...player, mondayPrediction: 0 }]];
    expect(await getLivePlayerPicks("week")).toEqual([{
      userId: "player", displayName: "Example player", picks: { game: "KC" },
      mondayPrediction: 0, updatedAt: player.updatedAt.toISOString(), cardState: "saved",
    }]);
  });

  it.each(["published", "locked", "final"])("only shares official picks and total at lock (%s)", async (status) => {
    vi.setSystemTime(week.entryDeadline);
    state.rows = [[{ ...week, status }], [player], [{ versionId: "v2", gameId: "game", team: "BAL" }]];
    expect(await getLivePlayerPicks("week")).toEqual([{
      userId: "player", displayName: "Example player", picks: { game: "BAL" },
      mondayPrediction: 45, updatedAt: player.committedAt.toISOString(), cardState: "official",
    }]);
  });

  it("does not promote an unsubmitted draft after the deadline", async () => {
    vi.setSystemTime(week.entryDeadline);
    state.rows = [[week], [{ ...player, officialVersionId: null, officialMondayPrediction: null, committedAt: null }]];
    expect((await getLivePlayerPicks("week"))?.[0]).toMatchObject({ picks: {}, mondayPrediction: null, cardState: "none", updatedAt: null });
  });

  it("preserves missing predictions as null", async () => {
    state.rows = [[week], [{ ...player, picks: null, mondayPrediction: null, updatedAt: null }]];
    expect((await getLivePlayerPicks("week"))?.[0]).toMatchObject({ picks: {}, mondayPrediction: null });
  });

  it("does not expose an unpublished or missing week", async () => {
    state.rows = [[]];
    expect(await getLivePlayerPicks("week")).toBeNull();
  });
});
