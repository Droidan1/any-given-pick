import { describe, expect, it } from "vitest";
import { getHomeWeekState } from "./home-week-state";
import type { PlayerGame } from "./entries/types";

function game(status: PlayerGame["status"]): PlayerGame {
  return {
    id: status,
    kickoffAt: "2026-08-13T23:00:00.000Z",
    status,
    day: "Thu",
    time: "7:00 PM EDT",
    away: { abbreviation: "DET", name: "Detroit Lions" },
    home: { abbreviation: "CIN", name: "Cincinnati Bengals" },
    awayScore: status === "scheduled" ? null : 10,
    homeScore: status === "scheduled" ? null : 7,
    isMondayTiebreaker: false,
    odds: null,
  };
}

const base = {
  deadlineLabel: "Wed, Aug 12, 6:00 PM EDT",
  games: [game("scheduled")],
  hasSubmitted: false,
  isLocked: false,
  selectedCount: 0,
};

describe("getHomeWeekState", () => {
  it("starts a new player with a make-picks action", () => {
    expect(getHomeWeekState(base)).toMatchObject({
      actionLabel: "Make your picks",
      destination: "picks",
    });
  });

  it("lets a submitted player update before the deadline", () => {
    expect(getHomeWeekState({ ...base, hasSubmitted: true, selectedCount: 16 })).toMatchObject({
      actionLabel: "Review or update picks",
      destination: "picks",
    });
  });

  it("sends a locked official card to live activity", () => {
    expect(getHomeWeekState({
      ...base,
      games: [game("in_progress")],
      hasSubmitted: true,
      isLocked: true,
      selectedCount: 16,
    })).toMatchObject({
      actionLabel: "Follow the live week race",
      destination: "race",
      lockedStatusLabel: "Official card locked",
    });
  });

  it("sends a completed official card to its results", () => {
    expect(getHomeWeekState({
      ...base,
      games: [game("final")],
      hasSubmitted: true,
      isLocked: true,
      selectedCount: 16,
    })).toMatchObject({
      actionLabel: "View your results",
      destination: "activity",
      lockedStatusLabel: "Results final",
    });
  });
});
