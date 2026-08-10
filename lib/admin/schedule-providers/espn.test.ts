import { describe, expect, it } from "vitest";
import {
  buildSeasonWeekRequests,
  normalizeEspnWeek,
  providerGamesToCsv,
  type EspnEvent,
} from "./espn";

function event(input: {
  id: string;
  date: string;
  awayCode: string;
  awayName: string;
  homeCode: string;
  homeName: string;
}): EspnEvent {
  return {
    id: input.id,
    date: input.date,
    competitions: [{
      date: input.date,
      competitors: [
        { homeAway: "home", team: { abbreviation: input.homeCode, displayName: input.homeName } },
        { homeAway: "away", team: { abbreviation: input.awayCode, displayName: input.awayName } },
      ],
    }],
  };
}

describe("ESPN schedule provider", () => {
  it("maps the three full ESPN preseason slates to NFL preseason weeks 1–3", () => {
    const requests = buildSeasonWeekRequests();

    expect(requests).toHaveLength(21);
    expect(requests.filter((request) => request.seasonPhase === "preseason")).toEqual([
      { seasonPhase: "preseason", seasonType: 1, weekNumber: 1, providerWeekNumber: 2 },
      { seasonPhase: "preseason", seasonType: 1, weekNumber: 2, providerWeekNumber: 3 },
      { seasonPhase: "preseason", seasonType: 1, weekNumber: 3, providerWeekNumber: 4 },
    ]);
  });

  it("normalizes a preseason game into the requested contest week", () => {
    const games = normalizeEspnWeek([
      event({
        id: "401873271",
        date: "2026-08-07T00:00:00Z",
        awayCode: "CAR",
        awayName: "Carolina Panthers",
        homeCode: "ARI",
        homeName: "Arizona Cardinals",
      }),
    ], { seasonPhase: "preseason", weekNumber: 1 });

    expect(games).toEqual([expect.objectContaining({
      seasonPhase: "preseason",
      weekNumber: 1,
      awayTeamCode: "CAR",
      homeTeamCode: "ARI",
      isTiebreaker: true,
      providerGameKey: "espn:401873271",
    })]);
  });

  it("chooses the latest Monday game and normalizes Washington's code", () => {
    const games = normalizeEspnWeek([
      event({ id: "sun", date: "2026-09-13T17:00:00Z", awayCode: "WSH", awayName: "Washington Commanders", homeCode: "NYG", homeName: "New York Giants" }),
      event({ id: "mon-early", date: "2026-09-15T00:00:00Z", awayCode: "BUF", awayName: "Buffalo Bills", homeCode: "NYJ", homeName: "New York Jets" }),
      event({ id: "mon-late", date: "2026-09-15T02:15:00Z", awayCode: "DEN", awayName: "Denver Broncos", homeCode: "LV", homeName: "Las Vegas Raiders" }),
    ], { seasonPhase: "regular", weekNumber: 1 });

    expect(games[0].awayTeamCode).toBe("WAS");
    expect(games.filter((game) => game.isTiebreaker)).toEqual([
      expect.objectContaining({ providerGameKey: "espn:mon-late" }),
    ]);
  });

  it("uses the latest game when a regular week has no Monday game", () => {
    const games = normalizeEspnWeek([
      event({ id: "early", date: "2027-01-09T18:00:00Z", awayCode: "IND", awayName: "Indianapolis Colts", homeCode: "HOU", homeName: "Houston Texans" }),
      event({ id: "late", date: "2027-01-11T01:20:00Z", awayCode: "DAL", awayName: "Dallas Cowboys", homeCode: "PHI", homeName: "Philadelphia Eagles" }),
    ], { seasonPhase: "regular", weekNumber: 18 });

    expect(games.at(-1)?.isTiebreaker).toBe(true);
  });

  it("creates a CSV that survives names containing commas", () => {
    const [game] = normalizeEspnWeek([
      event({ id: "comma", date: "2026-08-07T00:00:00Z", awayCode: "CAR", awayName: "Carolina, Panthers", homeCode: "ARI", homeName: "Arizona Cardinals" }),
    ], { seasonPhase: "preseason", weekNumber: 1 });

    expect(providerGamesToCsv([game])).toContain('"Carolina, Panthers"');
  });

  it("rejects malformed games instead of producing partial rows", () => {
    expect(() => normalizeEspnWeek([{ id: "broken", competitions: [] }], {
      seasonPhase: "regular",
      weekNumber: 1,
    })).toThrow("competition details");
  });
});
