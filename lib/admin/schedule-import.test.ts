import { describe, expect, it } from "vitest";
import {
  parseScheduleText,
  validateWeekDetails,
} from "./schedule-import";

const SCHEDULE_FIXTURE = `kickoff_at,away_code,away_name,home_code,home_name,monday_tiebreaker,provider_game_key
2026-09-11T20:20:00-04:00,DAL,Dallas Cowboys,PHI,Philadelphia Eagles,false,fixture-001
2026-09-14T20:15:00-04:00,BAL,Baltimore Ravens,CLE,Cleveland Browns,true,fixture-002`;

const PRESEASON_SCHEDULE_FIXTURE = `kickoff_at,away_code,away_name,home_code,home_name,monday_tiebreaker,provider_game_key
2026-08-13T19:00:00-04:00,DET,Detroit Lions,CIN,Cincinnati Bengals,false,pre-fixture-001
2026-08-16T20:00:00-04:00,CLE,Cleveland Browns,CHI,Chicago Bears,true,pre-fixture-002`;

describe("parseScheduleText", () => {
  it("normalizes a valid CSV schedule", () => {
    const result = parseScheduleText(SCHEDULE_FIXTURE);

    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(result.delimiter).toBe("comma");
    expect(result.games).toHaveLength(2);
    expect(result.games[0]).toMatchObject({
      awayTeamCode: "DAL",
      homeTeamCode: "PHI",
      isMondayTiebreaker: false,
    });
    expect(result.games[1].isMondayTiebreaker).toBe(true);
  });

  it("accepts spreadsheet-style tab-separated input and quoted commas", () => {
    const result = parseScheduleText(
      [
        "kickoff_at\taway_code\taway_name\thome_code\thome_name\tmonday_tiebreaker",
        "2026-09-13T13:00:00-04:00\tNYG\tNew York Giants\tWAS\tWashington Commanders\tno",
        "2026-09-14T20:15:00-04:00\tBUF\tBuffalo Bills\tNYJ\tNew York Jets\tyes",
      ].join("\n"),
    );

    expect(result.delimiter).toBe("tab");
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(result.games.map((game) => game.awayTeamCode)).toEqual(["NYG", "BUF"]);
  });

  it("reports missing columns, invalid rows, duplicates, and tiebreaker count", () => {
    const result = parseScheduleText(
      [
        "kickoff_at,away_code,away_name,home_code,home_name,monday_tiebreaker",
        "not-a-date,IND,Indianapolis Colts,IND,Indianapolis Colts,maybe",
        "not-a-date,IND,Indianapolis Colts,IND,Indianapolis Colts,maybe",
      ].join("\n"),
    );

    expect(result.games).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["invalid_kickoff", "same_team", "invalid_tiebreaker", "duplicate_game"]),
    );
  });

  it("requires exactly one Monday tiebreaker", () => {
    const result = parseScheduleText(
      SCHEDULE_FIXTURE.replace("false,fixture-001", "true,fixture-001"),
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "tiebreaker_count", severity: "error" }),
    );
  });
});

describe("validateWeekDetails", () => {
  it("rejects a deadline at or after kickoff", () => {
    const games = parseScheduleText(SCHEDULE_FIXTURE).games;
    const issues = validateWeekDetails(
      {
        season: new Date().getUTCFullYear(),
        seasonPhase: "regular",
        weekNumber: 1,
        label: "Opening week",
        entryDeadline: "2026-09-12T12:00:00-04:00",
      },
      games,
    );

    expect(issues).toContainEqual(expect.objectContaining({ code: "kickoff_before_deadline" }));
  });

  it("accepts preseason weeks 1–4 and a non-Monday tiebreaker", () => {
    const games = parseScheduleText(PRESEASON_SCHEDULE_FIXTURE).games;
    const issues = validateWeekDetails(
      {
        season: new Date().getUTCFullYear(),
        seasonPhase: "preseason",
        weekNumber: 4,
        label: "Preseason finale",
        entryDeadline: "2026-08-05T18:00:00-04:00",
      },
      games,
    );

    expect(issues).toEqual([]);
  });

  it("rejects a preseason week above four", () => {
    const games = parseScheduleText(PRESEASON_SCHEDULE_FIXTURE).games;
    const issues = validateWeekDetails(
      {
        season: new Date().getUTCFullYear(),
        seasonPhase: "preseason",
        weekNumber: 5,
        label: "",
        entryDeadline: "2026-08-05T18:00:00-04:00",
      },
      games,
    );

    expect(issues).toContainEqual(expect.objectContaining({ code: "invalid_week" }));
  });
});
