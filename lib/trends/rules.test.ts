import { describe, expect, it } from "vitest";
import type { WeeklyResults } from "@/lib/results/service";
import { buildPickTrends } from "./rules";

function revealedResults(): WeeklyResults {
  return {
    weeks: [],
    selectedWeek: null,
    revealStatus: "revealed",
    serverNow: "2026-08-24T12:00:00.000Z",
    games: [
      {
        id: "game-1",
        kickoffAt: "2026-08-24T20:00:00.000Z",
        awayTeamCode: "IND",
        awayTeamName: "Indianapolis Colts",
        homeTeamCode: "CHI",
        homeTeamName: "Chicago Bears",
        awayScore: null,
        homeScore: null,
        status: "scheduled",
        isMondayTiebreaker: false,
      },
      {
        id: "game-2",
        kickoffAt: "2026-08-25T00:00:00.000Z",
        awayTeamCode: "BUF",
        awayTeamName: "Buffalo Bills",
        homeTeamCode: "NYJ",
        homeTeamName: "New York Jets",
        awayScore: null,
        homeScore: null,
        status: "scheduled",
        isMondayTiebreaker: false,
      },
    ],
    entries: [
      {
        userId: "user-1",
        displayName: "Coach",
        profilePhotoUrl: null,
        isCurrentUser: true,
        versionNumber: 1,
        committedAt: "2026-08-24T11:00:00.000Z",
        mondayPrediction: 42,
        correctPicks: 0,
        gradedPicks: 0,
        picks: [
          {
            gameId: "game-1",
            kickoffAt: "2026-08-24T20:00:00.000Z",
            awayTeamCode: "IND",
            awayTeamName: "Indianapolis Colts",
            homeTeamCode: "CHI",
            homeTeamName: "Chicago Bears",
            awayScore: null,
            homeScore: null,
            gameStatus: "scheduled",
            isMondayTiebreaker: false,
            selectedTeamCode: "CHI",
            selectedTeamName: "Chicago Bears",
            outcome: "pending",
          },
        ],
      },
    ],
    distributions: [
      { gameId: "game-1", awayTeamCode: "IND", homeTeamCode: "CHI", awayCount: 2, homeCount: 8, totalPicks: 10, awayPercent: 20, homePercent: 80 },
      { gameId: "game-2", awayTeamCode: "BUF", homeTeamCode: "NYJ", awayCount: 5, homeCount: 5, totalPicks: 10, awayPercent: 50, homePercent: 50 },
    ],
  };
}

describe("buildPickTrends", () => {
  it("keeps trend data sealed before the deadline", () => {
    const input = revealedResults();
    input.revealStatus = "open";
    expect(buildPickTrends(input)).toEqual({
      status: "sealed",
      totalCards: 0,
      strongConsensusCount: 0,
      closeCallCount: 0,
      trends: [],
    });
  });

  it("identifies consensus, close splits, and the current user's call", () => {
    const snapshot = buildPickTrends(revealedResults());

    expect(snapshot).toMatchObject({
      status: "ready",
      totalCards: 1,
      strongConsensusCount: 1,
      closeCallCount: 1,
    });
    expect(snapshot.trends[0]).toMatchObject({
      leaderCode: "CHI",
      leaderPercent: 80,
      margin: 60,
      strength: "strong",
      strengthLabel: "Strong consensus",
      currentUserPick: "CHI",
    });
    expect(snapshot.trends[1]).toMatchObject({
      leaderCode: null,
      strength: "even",
      strengthLabel: "Even split",
      currentUserPick: null,
    });
  });
});
