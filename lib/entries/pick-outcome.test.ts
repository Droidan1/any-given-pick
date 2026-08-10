import { describe, expect, it } from "vitest";
import { calculatePickOutcome } from "./pick-outcome";

const finalGame = {
  gameStatus: "final" as const,
  awayScore: 20,
  homeScore: 24,
  awayTeamCode: "DAL",
  homeTeamCode: "PHI",
};

describe("pick outcome", () => {
  it("grades winning and losing selections from the final score", () => {
    expect(calculatePickOutcome({ ...finalGame, selectedTeamCode: "PHI" })).toBe("won");
    expect(calculatePickOutcome({ ...finalGame, selectedTeamCode: "DAL" })).toBe("lost");
  });

  it("does not grade a game before it is final", () => {
    expect(calculatePickOutcome({
      ...finalGame,
      gameStatus: "in_progress",
      selectedTeamCode: "PHI",
    })).toBe("pending");
  });

  it("handles tied games and missing picks explicitly", () => {
    expect(calculatePickOutcome({
      ...finalGame,
      awayScore: 17,
      homeScore: 17,
      selectedTeamCode: "PHI",
    })).toBe("tie");
    expect(calculatePickOutcome({ ...finalGame, selectedTeamCode: null })).toBe("no_pick");
  });
});
