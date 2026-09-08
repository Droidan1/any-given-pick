import { describe, expect, it } from "vitest";
import { bestBoardsPerWeek, boardLimit } from "./board-rules";
import { userDraftStorageKey } from "./draft-storage";

describe("multiple board rules", () => {
  it("uses one board while disabled and the administrator's limit while enabled", () => {
    expect(boardLimit({ multipleBoardsEnabled: false, maxBoards: 8, revision: 0 })).toBe(1);
    expect(boardLimit({ multipleBoardsEnabled: true, maxBoards: 8, revision: 0 })).toBe(8);
  });
  it("chooses one whole board per player per week using points, its tiebreaker, then board number", () => {
    const board = { userId: "a", weekId: "one", boardNumber: 1, correctPicks: 8, tiebreakerDiff: 0 };
    const result = bestBoardsPerWeek([
      board,
      { ...board, boardNumber: 2, correctPicks: 10, tiebreakerDiff: 5 },
      { ...board, boardNumber: 4, correctPicks: 10, tiebreakerDiff: 2 },
      { ...board, boardNumber: 3, correctPicks: 10, tiebreakerDiff: 2 },
      { ...board, weekId: "two" },
      { ...board, userId: "b" },
    ]);
    expect(result.map(b => [b.userId, b.weekId, b.boardNumber])).toEqual([["a", "one", 3], ["a", "two", 1], ["b", "one", 1]]);
  });
  it("separates boards, players, and weeks in local draft storage while retaining Board 1's legacy key", () => {
    const keys = [userDraftStorageKey("a", "week"), userDraftStorageKey("a", "week", "two"), userDraftStorageKey("a", "week", "three"), userDraftStorageKey("b", "week", "two"), userDraftStorageKey("a", "other-week", "two")];
    expect(new Set(keys).size).toBe(5);
    expect(keys[0]).toBe("any-given-pick-draft:v3:a:week");
  });
});
