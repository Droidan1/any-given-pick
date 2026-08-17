import { describe, expect, it } from "vitest";
import { rankStandings } from "./rules";

describe("rankStandings", () => {
  it("ranks correct picks first and the lower cumulative tiebreaker difference second", () => {
    const rows = rankStandings([
      { userId: "a", displayName: "Alpha", profilePhotoUrl: null, correctPicks: 10, gradedPicks: 12, tiebreakerDiff: 7 },
      { userId: "b", displayName: "Bravo", profilePhotoUrl: null, correctPicks: 11, gradedPicks: 12, tiebreakerDiff: 12 },
      { userId: "c", displayName: "Charlie", profilePhotoUrl: null, correctPicks: 10, gradedPicks: 12, tiebreakerDiff: 3 },
    ]);

    expect(rows.map((row) => [row.rank, row.displayName])).toEqual([
      [1, "Bravo"],
      [2, "Charlie"],
      [3, "Alpha"],
    ]);
  });

  it("gives tied players the same rank and leaves the next rank open", () => {
    const rows = rankStandings([
      { userId: "a", displayName: "Alpha", profilePhotoUrl: null, correctPicks: 8, gradedPicks: 10, tiebreakerDiff: 4 },
      { userId: "b", displayName: "Bravo", profilePhotoUrl: null, correctPicks: 8, gradedPicks: 10, tiebreakerDiff: 4 },
      { userId: "c", displayName: "Charlie", profilePhotoUrl: null, correctPicks: 7, gradedPicks: 10, tiebreakerDiff: null },
    ]);

    expect(rows.map((row) => row.rank)).toEqual([1, 1, 3]);
  });
});
