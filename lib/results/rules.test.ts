import { describe, expect, it } from "vitest";
import { buildPickDistributions, canRevealWeeklyPicks } from "./rules";

describe("canRevealWeeklyPicks", () => {
  const deadline = new Date("2026-09-10T22:00:00.000Z");

  it("keeps every official card private before the server deadline", () => {
    expect(canRevealWeeklyPicks(deadline, new Date("2026-09-10T21:59:59.999Z"))).toBe(false);
  });

  it("reveals cards at the deadline", () => {
    expect(canRevealWeeklyPicks(deadline, new Date("2026-09-10T22:00:00.000Z"))).toBe(true);
  });

  it("reveals cards after the deadline", () => {
    expect(canRevealWeeklyPicks(deadline, new Date("2026-09-11T01:00:00.000Z"))).toBe(true);
  });
});

describe("buildPickDistributions", () => {
  it("calculates whole-number pick percentages without exposing drafts", () => {
    const distributions = buildPickDistributions(
      [{ id: "game-1", awayTeamCode: "IND", homeTeamCode: "CHI" }],
      [
        { gameId: "game-1", selectedTeamCode: "IND" },
        { gameId: "game-1", selectedTeamCode: "IND" },
        { gameId: "game-1", selectedTeamCode: "CHI" },
      ],
    );

    expect(distributions[0]).toMatchObject({
      awayCount: 2,
      homeCount: 1,
      totalPicks: 3,
      awayPercent: 67,
      homePercent: 33,
    });
  });
});
