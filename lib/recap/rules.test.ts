import { describe, expect, it } from "vitest";
import type { WeeklyResults } from "../results/service";
import { buildWeeklyRecap } from "./rules";

function finishedResults(): WeeklyResults {
  return {
    weeks: [],
    selectedWeek: {
      id: "week-2",
      season: 2026,
      seasonPhase: "regular",
      weekNumber: 2,
      label: "Week 2",
      entryDeadline: "2026-09-16T22:00:00.000Z",
    },
    revealStatus: "revealed",
    serverNow: "2026-09-22T14:00:00.000Z",
    games: [
      { id: "g1", kickoffAt: "2026-09-17T00:00:00.000Z", awayTeamCode: "IND", awayTeamName: "Indianapolis Colts", homeTeamCode: "HOU", homeTeamName: "Houston Texans", awayScore: 24, homeScore: 20, status: "final", isMondayTiebreaker: false },
      { id: "g2", kickoffAt: "2026-09-22T00:00:00.000Z", awayTeamCode: "DET", awayTeamName: "Detroit Lions", homeTeamCode: "GB", homeTeamName: "Green Bay Packers", awayScore: 17, homeScore: 21, status: "final", isMondayTiebreaker: true },
    ],
    entries: [
      {
        userId: "current",
        displayName: "Napalm",
        profilePhotoUrl: null,
        isCurrentUser: true,
        versionNumber: 1,
        committedAt: "2026-09-16T20:00:00.000Z",
        mondayPrediction: 41,
        correctPicks: 2,
        gradedPicks: 2,
        picks: [
          { gameId: "g1", kickoffAt: "2026-09-17T00:00:00.000Z", awayTeamCode: "IND", awayTeamName: "Indianapolis Colts", homeTeamCode: "HOU", homeTeamName: "Houston Texans", awayScore: 24, homeScore: 20, gameStatus: "final", isMondayTiebreaker: false, selectedTeamCode: "IND", selectedTeamName: "Indianapolis Colts", outcome: "won" },
          { gameId: "g2", kickoffAt: "2026-09-22T00:00:00.000Z", awayTeamCode: "DET", awayTeamName: "Detroit Lions", homeTeamCode: "GB", homeTeamName: "Green Bay Packers", awayScore: 17, homeScore: 21, gameStatus: "final", isMondayTiebreaker: true, selectedTeamCode: "GB", selectedTeamName: "Green Bay Packers", outcome: "won" },
        ],
      },
      {
        userId: "other",
        displayName: "Coach B",
        profilePhotoUrl: null,
        isCurrentUser: false,
        versionNumber: 1,
        committedAt: "2026-09-16T20:05:00.000Z",
        mondayPrediction: 50,
        correctPicks: 1,
        gradedPicks: 2,
        picks: [
          { gameId: "g1", kickoffAt: "2026-09-17T00:00:00.000Z", awayTeamCode: "IND", awayTeamName: "Indianapolis Colts", homeTeamCode: "HOU", homeTeamName: "Houston Texans", awayScore: 24, homeScore: 20, gameStatus: "final", isMondayTiebreaker: false, selectedTeamCode: "HOU", selectedTeamName: "Houston Texans", outcome: "lost" },
          { gameId: "g2", kickoffAt: "2026-09-22T00:00:00.000Z", awayTeamCode: "DET", awayTeamName: "Detroit Lions", homeTeamCode: "GB", homeTeamName: "Green Bay Packers", awayScore: 17, homeScore: 21, gameStatus: "final", isMondayTiebreaker: true, selectedTeamCode: "GB", selectedTeamName: "Green Bay Packers", outcome: "won" },
        ],
      },
    ],
    distributions: [
      { gameId: "g1", awayTeamCode: "IND", homeTeamCode: "HOU", awayCount: 1, homeCount: 1, totalPicks: 2, awayPercent: 50, homePercent: 50 },
      { gameId: "g2", awayTeamCode: "DET", homeTeamCode: "GB", awayCount: 0, homeCount: 2, totalPicks: 2, awayPercent: 0, homePercent: 100 },
    ],
  };
}

describe("buildWeeklyRecap", () => {
  it("builds a ranked final recap with a tiebreaker and boldest correct call", () => {
    const recap = buildWeeklyRecap(finishedResults());

    expect(recap).toMatchObject({
      status: "ready",
      correctPicks: 2,
      gradedPicks: 2,
      rank: 1,
      fieldSize: 2,
      winRate: 100,
      bestStreak: 2,
      tiebreaker: { prediction: 41, actual: 38, difference: 3 },
      boldestHit: { teamCode: "IND", pickPercent: 50 },
    });
  });

  it("keeps the recap in progress until every game is final or canceled", () => {
    const results = finishedResults();
    results.games[1] = { ...results.games[1], status: "in_progress" };
    results.entries[0].picks[1] = { ...results.entries[0].picks[1], gameStatus: "in_progress", outcome: "pending" };

    expect(buildWeeklyRecap(results)).toMatchObject({
      status: "waiting",
      completedGames: 1,
      gameCount: 2,
      rank: null,
    });
  });

  it("returns a no-entry recap state without exposing another player's card", () => {
    const results = finishedResults();
    results.entries = results.entries.map((entry) => ({ ...entry, isCurrentUser: false }));

    expect(buildWeeklyRecap(results)).toMatchObject({
      status: "no_entry",
      player: null,
      fieldSize: 2,
    });
  });

  it("counts only strictly lower-ranked players when the current player is tied", () => {
    const results = finishedResults();
    const current = results.entries[0];
    const lower = results.entries[1];
    current.correctPicks = 1;
    lower.correctPicks = 0;
    results.entries.push(
      {
        ...current,
        userId: "leader",
        displayName: "Leader",
        isCurrentUser: false,
        correctPicks: 2,
        mondayPrediction: 38,
      },
      {
        ...current,
        userId: "tied-peer",
        displayName: "Tied Peer",
        isCurrentUser: false,
        correctPicks: 1,
        mondayPrediction: 35,
      },
    );

    expect(buildWeeklyRecap(results)).toMatchObject({
      status: "ready",
      rank: 2,
      tiedAtRank: true,
      fieldSize: 4,
      playersBehind: 1,
    });
  });
});
