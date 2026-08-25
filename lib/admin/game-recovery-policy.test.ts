import { describe, expect, it } from "vitest";
import { gameRecoveryDecision } from "./game-recovery-policy";

const now = new Date("2026-09-01T12:00:00.000Z");

describe("commissioner game recovery policy", () => {
  it("preserves postponed games as an explicit non-final state", () => {
    expect(gameRecoveryDecision({ action: "postpone" }, now)).toEqual({
      ok: true,
      status: "postponed",
    });
  });

  it("makes canceled games count as complete without inventing a score", () => {
    expect(gameRecoveryDecision({ action: "cancel" }, now)).toEqual({
      ok: true,
      status: "canceled",
    });
  });

  it("requires a future kickoff when returning a game to the schedule", () => {
    expect(gameRecoveryDecision({
      action: "reschedule",
      kickoffAt: "2026-09-01T11:00:00.000Z",
    }, now)).toEqual({
      ok: false,
      message: "The replacement kickoff must be in the future.",
    });

    expect(gameRecoveryDecision({
      action: "reschedule",
      kickoffAt: "2026-09-02T00:00:00.000Z",
    }, now)).toMatchObject({ ok: true, status: "scheduled" });
  });
});
