import { describe, expect, it } from "vitest";
import { validatePublishableSlate, type PublishableGame } from "./week-publish-policy";

function preseasonSlate(): PublishableGame[] {
  return Array.from({ length: 16 }, (_, index) => ({
    awayTeamCode: `A${index}`,
    homeTeamCode: `H${index}`,
    isMondayTiebreaker: index === 15,
  }));
}

describe("validatePublishableSlate", () => {
  it("accepts a complete 16-game preseason slate", () => {
    expect(validatePublishableSlate("preseason", preseasonSlate())).toEqual([]);
  });

  it("rejects incomplete slates and repeat team appearances", () => {
    const games = preseasonSlate().slice(0, 15);
    games[0] = { ...games[0], isMondayTiebreaker: true };
    games[1] = { ...games[1], awayTeamCode: games[0].awayTeamCode };

    expect(validatePublishableSlate("preseason", games)).toEqual([
      "A preseason week must contain exactly 16 games.",
      "Each team can appear only once. Repeated: A0.",
    ]);
  });

  it("requires one tiebreaker", () => {
    const games = preseasonSlate().map((game) => ({ ...game, isMondayTiebreaker: false }));
    expect(validatePublishableSlate("preseason", games)).toContain(
      "Designate exactly one preseason tiebreaker game.",
    );
  });
});
