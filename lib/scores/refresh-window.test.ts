import { describe, expect, it } from "vitest";
import { hasScoreRefreshWindow, isScoreRefreshWindow, nextScoreRefreshWindow } from "./refresh-window";

const kickoffAt = "2026-09-13T17:00:00.000Z";

describe("score refresh windows", () => {
  it("polls while a provider marks a game in progress", () => {
    expect(isScoreRefreshWindow({ kickoffAt, gameStatus: "in_progress" }, new Date("2026-09-14T17:00:00.000Z"))).toBe(true);
  });

  it("starts shortly before a scheduled kickoff and stops after the result window", () => {
    expect(isScoreRefreshWindow({ kickoffAt, gameStatus: "scheduled" }, new Date("2026-09-13T16:45:00.000Z"))).toBe(true);
    expect(isScoreRefreshWindow({ kickoffAt, gameStatus: "scheduled" }, new Date("2026-09-13T23:00:00.000Z"))).toBe(true);
    expect(isScoreRefreshWindow({ kickoffAt, gameStatus: "scheduled" }, new Date("2026-09-13T16:44:59.999Z"))).toBe(false);
    expect(isScoreRefreshWindow({ kickoffAt, gameStatus: "scheduled" }, new Date("2026-09-13T23:00:00.001Z"))).toBe(false);
  });

  it("does not poll final, postponed, canceled, or malformed games", () => {
    expect(hasScoreRefreshWindow([
      { kickoffAt, gameStatus: "final" },
      { kickoffAt, gameStatus: "postponed" },
      { kickoffAt, gameStatus: "canceled" },
      { kickoffAt: "not-a-date", gameStatus: "scheduled" },
    ], new Date("2026-09-13T18:00:00.000Z"))).toBe(false);
  });

  it("schedules the next automatic window fifteen minutes before kickoff", () => {
    expect(nextScoreRefreshWindow([
      { kickoffAt: "2026-09-14T17:00:00.000Z", gameStatus: "scheduled" },
      { kickoffAt, gameStatus: "scheduled" },
    ], new Date("2026-09-13T12:00:00.000Z"))).toBe("2026-09-13T16:45:00.000Z");
    expect(nextScoreRefreshWindow([
      { kickoffAt, gameStatus: "final" },
    ], new Date("2026-09-13T12:00:00.000Z"))).toBeNull();
  });
});
