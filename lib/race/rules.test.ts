import { describe, expect, it } from "vitest";
import type { WeeklyResults } from "@/lib/results/service";
import { buildLiveWeekRace } from "./rules";

function resultsFixture(): WeeklyResults {
  return {
    weeks: [],
    selectedWeek: {
      id: "week-2",
      season: 2026,
      seasonPhase: "preseason",
      weekNumber: 2,
      label: "Preseason Week 2",
      entryDeadline: "2026-08-19T22:00:00.000Z",
    },
    revealStatus: "revealed",
    serverNow: "2026-08-21T00:00:00.000Z",
    games: [
      {
        id: "final",
        kickoffAt: "2026-08-20T23:00:00.000Z",
        awayTeamCode: "BUF",
        awayTeamName: "Buffalo Bills",
        homeTeamCode: "PIT",
        homeTeamName: "Pittsburgh Steelers",
        awayScore: 24,
        homeScore: 20,
        status: "final",
        isMondayTiebreaker: false,
      },
      {
        id: "live",
        kickoffAt: "2026-08-21T00:00:00.000Z",
        awayTeamCode: "SEA",
        awayTeamName: "Seattle Seahawks",
        homeTeamCode: "LAR",
        homeTeamName: "Los Angeles Rams",
        awayScore: 17,
        homeScore: 14,
        status: "in_progress",
        isMondayTiebreaker: false,
      },
    ],
    entries: [
      {
        userId: "one",
        displayName: "Napalm",
        profilePhotoUrl: null,
        isCurrentUser: true,
        versionNumber: 1,
        committedAt: "2026-08-19T21:00:00.000Z",
        mondayPrediction: 45,
        correctPicks: 1,
        gradedPicks: 1,
        picks: [
          {
            gameId: "final", kickoffAt: "", awayTeamCode: "BUF", awayTeamName: "Buffalo Bills", homeTeamCode: "PIT", homeTeamName: "Pittsburgh Steelers", awayScore: 24, homeScore: 20, gameStatus: "final", isMondayTiebreaker: false, selectedTeamCode: "BUF", selectedTeamName: "Buffalo Bills", outcome: "won",
          },
          {
            gameId: "live", kickoffAt: "", awayTeamCode: "SEA", awayTeamName: "Seattle Seahawks", homeTeamCode: "LAR", homeTeamName: "Los Angeles Rams", awayScore: 17, homeScore: 14, gameStatus: "in_progress", isMondayTiebreaker: false, selectedTeamCode: "SEA", selectedTeamName: "Seattle Seahawks", outcome: "pending",
          },
        ],
      },
      {
        userId: "two",
        displayName: "Blitz Queen",
        profilePhotoUrl: null,
        isCurrentUser: false,
        versionNumber: 1,
        committedAt: "2026-08-19T21:00:00.000Z",
        mondayPrediction: 42,
        correctPicks: 1,
        gradedPicks: 1,
        picks: [
          {
            gameId: "final", kickoffAt: "", awayTeamCode: "BUF", awayTeamName: "Buffalo Bills", homeTeamCode: "PIT", homeTeamName: "Pittsburgh Steelers", awayScore: 24, homeScore: 20, gameStatus: "final", isMondayTiebreaker: false, selectedTeamCode: "BUF", selectedTeamName: "Buffalo Bills", outcome: "won",
          },
          {
            gameId: "live", kickoffAt: "", awayTeamCode: "SEA", awayTeamName: "Seattle Seahawks", homeTeamCode: "LAR", homeTeamName: "Los Angeles Rams", awayScore: 17, homeScore: 14, gameStatus: "in_progress", isMondayTiebreaker: false, selectedTeamCode: "LAR", selectedTeamName: "Los Angeles Rams", outcome: "pending",
          },
        ],
      },
    ],
    distributions: [],
  };
}

describe("buildLiveWeekRace", () => {
  it("projects the live leader and rank movement from the current score", () => {
    const race = buildLiveWeekRace(resultsFixture());
    expect(race.status).toBe("ready");
    expect(race.liveCount).toBe(1);
    expect(race.players[0]).toMatchObject({
      userId: "one",
      rank: 1,
      correct: 1,
      live: 1,
      projectedCorrect: 2,
      maxCorrect: 2,
    });
    expect(race.players[1].pathCopy).toContain("LAR");
  });

  it("keeps cards sealed before the deadline", () => {
    const fixture = resultsFixture();
    fixture.revealStatus = "open";
    fixture.games = [];
    fixture.entries = [];
    expect(buildLiveWeekRace(fixture)).toMatchObject({ status: "sealed", players: [] });
  });

  it("does not favor the current user when projected records are tied", () => {
    const fixture = resultsFixture();
    fixture.games[1].awayScore = 14;
    fixture.games[1].homeScore = 14;
    const race = buildLiveWeekRace(fixture);
    expect(race.players.map((player) => player.displayName)).toEqual(["Blitz Queen", "Napalm"]);
  });
});
