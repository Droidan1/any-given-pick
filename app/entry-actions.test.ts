import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as unknown[][], inserted: vi.fn(), after: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: state.after }));
vi.mock("@/lib/auth/app-user", () => ({ requireAppUser: async () => ({ id: "player" }) }));
vi.mock("@/lib/eligibility/authorize", () => ({
  requireParticipationEligibility: async () => ({ reason: "eligible" }),
  ParticipationForbiddenError: class extends Error {},
}));
vi.mock("@/lib/security/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/email/player-notifications", () => ({ queueAndProcessSubmissionConfirmation: vi.fn() }));
vi.mock("@/lib/push/player-notifications", () => ({ queueAndProcessSubmissionPush: vi.fn() }));
vi.mock("@/lib/native-push/player-notifications", () => ({ queueNativeSubmission: vi.fn() }));
vi.mock("@/lib/monitoring/operational-alerts", () => ({ reportOperationalIssue: vi.fn() }));
vi.mock("@/lib/db", () => {
  const select = () => {
    const query = {
      from: () => query, innerJoin: () => query, where: () => query,
      limit: () => query, orderBy: () => query, for: () => query,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(state.rows.shift() ?? []).then(resolve),
    };
    return query;
  };
  const transaction = {
    select,
    execute: async () => ({ rows: [{ now: new Date("2026-09-23T12:00:00Z") }] }),
    insert: state.inserted,
  };
  return { getDb: () => ({ transaction: async (action: (db: typeof transaction) => unknown) => action(transaction) }) };
});

import { submitEntry } from "./entry-actions";

const weekId = "2d1972af-b99e-4f8c-b6c3-5340a02c641f";
const gameId = "3d1972af-b99e-4f8c-b6c3-5340a02c641f";
const input = { weekId, picks: { [gameId]: "IND" }, mondayPrediction: 45,
  baseDraftRevision: 2, submissionKey: "4d1972af-b99e-4f8c-b6c3-5340a02c641f" };

describe("official submission conflict boundary", () => {
  beforeEach(() => { state.rows = []; state.inserted.mockReset(); state.after.mockReset(); });
  it("returns a recoverable conflict before changing another device's newer card", async () => {
    state.rows = [[], [{ id: weekId, status: "published", entryDeadline: new Date("2026-09-24T22:00:00Z") }],
      [{ id: gameId, awayTeamCode: "IND", homeTeamCode: "HOU", sortOrder: 0 }],
      [{ id: "entry", status: "draft", draftRevision: 4, draftPicks: { [gameId]: "HOU" },
        draftMondayPrediction: 42, updatedAt: new Date("2026-09-23T11:00:00Z") }]];
    const result = await submitEntry(input);
    expect(result).toMatchObject({ ok: false, code: "draft_conflict",
      serverDraft: { picks: { [gameId]: "HOU" }, mondayPrediction: 42, draftRevision: 4 } });
    expect(state.inserted).not.toHaveBeenCalled();
    expect(state.after).not.toHaveBeenCalled();
  });
  it("returns the original receipt for an acknowledged submission key before checking revisions or deadlines", async () => {
    state.rows = [[{ id: "version", versionNumber: 3, committedAt: new Date("2026-09-22T12:00:00Z"),
      action: "edit", mondayPrediction: 45, draftRevision: 8 }], [{ gameId, selectedTeamCode: "IND" }]];
    const result = await submitEntry(input);
    expect(result).toMatchObject({ ok: true, code: "submitted",
      receipt: { versionNumber: 3, officialPicks: input.picks, mondayPrediction: 45 } });
    expect(state.inserted).not.toHaveBeenCalled();
  });
});
