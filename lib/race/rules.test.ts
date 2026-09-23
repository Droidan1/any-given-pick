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
  function mondayFixture() {
    const fixture = resultsFixture();
    fixture.serverNow = "2026-09-28T16:00:00Z";
    fixture.games[1] = { ...fixture.games[1], isMondayTiebreaker: true,
      kickoffAt: "2026-09-29T00:15:00Z", status: "scheduled", awayScore: null, homeScore: null };
    return fixture;
  }

  it("shows Monday totals from Eastern midnight, not UTC midnight", () => {
    const fixture = mondayFixture();
    fixture.serverNow = "2026-09-28T03:59:59Z";
    expect(buildLiveWeekRace(fixture).mondayTiebreaker).toBeNull();
    fixture.serverNow = "2026-09-28T04:00:00Z";
    const race = buildLiveWeekRace(fixture);
    expect(race.mondayTiebreaker).toMatchObject({ gameId: "live", status: "scheduled", combinedTotal: null });
    expect(race.players.find((player) => player.userId === "one")?.mondayPrediction).toBe(45);
  });

  it("keeps Monday hidden when cards are sealed", () => {
    const fixture = mondayFixture();
    fixture.revealStatus = "open";
    expect(buildLiveWeekRace(fixture)).toMatchObject({ mondayTiebreaker: null, players: [] });
  });

  it("shows live zero without calculating final differences or reranking by live closeness", () => {
    const fixture = mondayFixture();
    fixture.games[1] = { ...fixture.games[1], status: "in_progress", awayScore: 0, homeScore: 0 };
    const race = buildLiveWeekRace(fixture);
    expect(race.mondayTiebreaker?.combinedTotal).toBe(0);
    expect(race.players.every((player) => player.tiebreakerDiff === null)).toBe(true);
    expect(race.players[0].displayName).toBe("Blitz Queen");
  });

  it("keeps the final total and differences visible Tuesday, with correct picks ranked first", () => {
    const fixture = mondayFixture();
    fixture.serverNow = "2026-09-29T12:00:00Z";
    fixture.games[1] = { ...fixture.games[1], status: "final", awayScore: 24, homeScore: 21 };
    fixture.entries[0].mondayPrediction = 100;
    fixture.entries[1].mondayPrediction = 45;
    fixture.entries[0].picks[1] = { ...fixture.entries[0].picks[1], gameStatus: "final", outcome: "won" };
    fixture.entries[1].picks[1] = { ...fixture.entries[1].picks[1], gameStatus: "final", outcome: "lost" };
    const race = buildLiveWeekRace(fixture);
    expect(race.mondayTiebreaker).toMatchObject({ status: "final", combinedTotal: 45 });
    expect(race.players[0]).toMatchObject({ userId: "one", correct: 2, tiebreakerDiff: 55 });
    expect(race.players[1].tiebreakerDiff).toBe(0);
  });

  it.each(["postponed", "canceled"] as const)("does not calculate totals for %s games", (status) => {
    const fixture = mondayFixture();
    fixture.games[1] = { ...fixture.games[1], status, awayScore: 24, homeScore: 21 };
    const race = buildLiveWeekRace(fixture);
    expect(race.mondayTiebreaker).toMatchObject({ status, combinedTotal: null });
    expect(race.players.every((player) => player.tiebreakerDiff === null)).toBe(true);
  });

  it("uses all games, not only the three featured games, and handles a missing score", () => {
    const fixture = mondayFixture();
    fixture.games[1] = { ...fixture.games[1], status: "final", awayScore: 24, homeScore: null };
    for (let i = 0; i < 4; i++) fixture.games.push({ ...fixture.games[0], id: `extra-${i}`, status: "in_progress" });
    const race = buildLiveWeekRace(fixture);
    expect(race.gamesToFeature.some((game) => game.isMondayTiebreaker)).toBe(false);
    expect(race.mondayTiebreaker?.combinedTotal).toBeNull();
    expect(race.players.every((player) => player.tiebreakerDiff === null)).toBe(true);
  });

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
