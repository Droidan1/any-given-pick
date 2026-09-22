import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ db: vi.fn(), sync: vi.fn(), schedule: vi.fn(), revalidate: vi.fn(), report: vi.fn(), resolve: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: mock.db }));
vi.mock("./sync", () => ({ syncRecentEspnScores: mock.sync }));
vi.mock("./result-notifications", () => ({ scheduleResultsNotifications: mock.schedule }));
vi.mock("next/cache", () => ({ revalidateTag: mock.revalidate }));
vi.mock("@/lib/standings/service", () => ({ STANDINGS_CACHE_TAG: "standings" }));
vi.mock("@/lib/monitoring/operational-alerts", () => ({ reportOperationalIssue: mock.report, resolveOperationalIssue: mock.resolve }));
import { runEspnScoreSyncWithHealth } from "./health";

const now = new Date("2026-09-29T03:00:00Z");
const summary = { checkedWeeks: 1, checkedGames: 1, updatedGames: 1, errors: [] };
let states: Array<{ status: string }>;
beforeEach(() => {
  vi.resetAllMocks(); states = [];
  const chain = {
    values: () => chain, onConflictDoUpdate: async () => {},
    set: (state: { status: string }) => { states.push(state); return chain; }, where: async () => {},
  };
  mock.db.mockReturnValue({ insert: () => chain, update: () => chain });
  mock.sync.mockResolvedValue(summary);
});

describe("score sync event hook", () => {
  it("schedules results only after the score sync has finished and health is saved", async () => {
    mock.schedule.mockImplementation(() => expect(states.at(-1)?.status).toBe("healthy"));
    expect(await runEspnScoreSyncWithHealth(now)).toEqual(summary);
    expect(mock.schedule).toHaveBeenCalledWith(now);
    expect(mock.sync.mock.invocationCallOrder[0]).toBeLessThan(mock.schedule.mock.invocationCallOrder[0]);
  });
  it("does not run extra notification work when no games changed", async () => {
    mock.sync.mockResolvedValue({ ...summary, updatedGames: 0 });
    await runEspnScoreSyncWithHealth(now);
    expect(mock.schedule).not.toHaveBeenCalled();
  });
  it("still checks successfully updated games if a different provider week failed", async () => {
    mock.sync.mockResolvedValue({ ...summary, errors: ["A different week failed"] });
    await runEspnScoreSyncWithHealth(now);
    expect(states.at(-1)?.status).toBe("warning");
    expect(mock.schedule).toHaveBeenCalledWith(now);
  });
  it("does not announce results when the score sync itself fails", async () => {
    mock.sync.mockRejectedValue(new Error("Provider unavailable"));
    await expect(runEspnScoreSyncWithHealth(now)).rejects.toThrow("Provider unavailable");
    expect(states.at(-1)?.status).toBe("failed");
    expect(mock.schedule).not.toHaveBeenCalled();
  });
});
