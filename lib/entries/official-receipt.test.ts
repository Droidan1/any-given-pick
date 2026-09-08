import { describe, expect, it } from "vitest";
import { hasUnsubmittedOfficialEdits } from "./official-receipt";

const games = [
  { id: "game-1", awayTeamCode: "IND", homeTeamCode: "CHI" },
  { id: "game-2", awayTeamCode: "DET", homeTeamCode: "GB" },
];

describe("official receipt integrity", () => {
  it("keeps an official snapshot distinct from later draft pick edits", () => {
    expect(hasUnsubmittedOfficialEdits({
      games,
      draftPicks: { "game-1": "CHI", "game-2": "GB" },
      draftMondayPrediction: 44,
      officialPicks: { "game-1": "IND", "game-2": "GB" },
      officialMondayPrediction: 44,
    })).toBe(true);
  });

  it("detects a tiebreaker-only edit without changing the official value", () => {
    expect(hasUnsubmittedOfficialEdits({
      games,
      draftPicks: { "game-1": "IND", "game-2": "GB" },
      draftMondayPrediction: 51,
      officialPicks: { "game-1": "IND", "game-2": "GB" },
      officialMondayPrediction: 44,
    })).toBe(true);
  });

  it("reports no pending edits when draft and official snapshots match", () => {
    expect(hasUnsubmittedOfficialEdits({
      games,
      draftPicks: { "game-1": "IND", "game-2": "GB" },
      draftMondayPrediction: 44,
      officialPicks: { "game-1": "IND", "game-2": "GB" },
      officialMondayPrediction: 44,
    })).toBe(false);
  });
});
