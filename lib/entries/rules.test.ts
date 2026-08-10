import { describe, expect, it } from "vitest";
import { sanitizeDraftPicks, validateEntrySelections } from "./rules";

const games = [
  { id: "game-1", awayTeamCode: "IND", homeTeamCode: "CHI" },
  { id: "game-2", awayTeamCode: "BUF", homeTeamCode: "MIA" },
];

describe("validateEntrySelections", () => {
  it("accepts a complete entry and normalizes team codes", () => {
    const result = validateEntrySelections({
      games,
      picks: { "game-1": "ind", "game-2": "MIA" },
      mondayPrediction: 44,
      requireComplete: true,
    });

    expect(result.issues).toEqual([]);
    expect(result.picks).toEqual({ "game-1": "IND", "game-2": "MIA" });
  });

  it("allows a partial draft", () => {
    const result = validateEntrySelections({
      games,
      picks: { "game-1": "CHI" },
      mondayPrediction: null,
      requireComplete: false,
    });

    expect(result.issues).toEqual([]);
  });

  it("rejects incomplete submissions", () => {
    const result = validateEntrySelections({
      games,
      picks: { "game-1": "CHI" },
      mondayPrediction: null,
      requireComplete: true,
    });

    expect(result.issues.map((issue) => issue.code)).toEqual([
      "missing_pick",
      "invalid_monday_prediction",
    ]);
  });

  it("rejects unknown games, invalid teams, and unreasonable totals", () => {
    const result = validateEntrySelections({
      games,
      picks: { "game-1": "DET", "game-3": "NYJ" },
      mondayPrediction: 201,
      requireComplete: false,
    });

    expect(result.issues.map((issue) => issue.code)).toEqual([
      "invalid_team",
      "unknown_game",
      "invalid_monday_prediction",
    ]);
  });

  it("removes stale selections while preserving picks for the current slate", () => {
    expect(
      sanitizeDraftPicks(games, {
        "game-1": "CHI",
        "game-2": "MIA",
        "replaced-game": "NYJ",
      }),
    ).toEqual({ "game-1": "CHI", "game-2": "MIA" });
  });

  it("removes a selection when its team no longer matches the game", () => {
    expect(sanitizeDraftPicks(games, { "game-1": "DET" })).toEqual({});
  });
});
