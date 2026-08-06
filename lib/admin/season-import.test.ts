import { describe, expect, it } from "vitest";
import {
  defaultWeekDeadline,
  parseSeasonScheduleText,
  SEASON_SCHEDULE_TEMPLATE,
} from "./season-import";

describe("parseSeasonScheduleText", () => {
  it("groups preseason and regular games into ordered private-week inputs", () => {
    const result = parseSeasonScheduleText(SEASON_SCHEDULE_TEMPLATE, 2026);

    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(result.gameCount).toBe(7);
    expect(result.weeks.map((week) => `${week.seasonPhase}:${week.weekNumber}`)).toEqual([
      "preseason:1",
      "preseason:2",
      "regular:1",
      "regular:2",
    ]);
  });

  it("automatically chooses the latest Monday game for a regular week", () => {
    const result = parseSeasonScheduleText(SEASON_SCHEDULE_TEMPLATE, 2026);
    const regularWeek = result.weeks.find((week) => week.seasonPhase === "regular" && week.weekNumber === 1);

    expect(regularWeek?.tiebreakerSelection).toBe("automatic");
    expect(regularWeek?.games.find((game) => game.isMondayTiebreaker)?.homeTeamCode).toBe("CIN");
  });

  it("uses the latest preseason game when no tiebreaker is supplied", () => {
    const result = parseSeasonScheduleText(SEASON_SCHEDULE_TEMPLATE, 2026);
    const preseasonWeek = result.weeks.find((week) => week.seasonPhase === "preseason" && week.weekNumber === 2);

    expect(preseasonWeek?.tiebreakerSelection).toBe("automatic");
    expect(preseasonWeek?.games[0].isMondayTiebreaker).toBe(true);
  });

  it("calculates Wednesday at 6 PM Indianapolis time before kickoff", () => {
    expect(defaultWeekDeadline("2026-09-10T20:20:00-04:00")).toBe("2026-09-09T22:00:00.000Z");
    expect(defaultWeekDeadline("2026-11-08T13:00:00-05:00")).toBe("2026-11-04T23:00:00.000Z");
  });

  it("rejects duplicate teams and multiple tiebreakers within a week", () => {
    const input = `season_phase,week_number,kickoff_at,away_code,away_name,home_code,home_name,tiebreaker
regular,1,2026-09-10T20:20:00-04:00,DAL,Dallas Cowboys,NYG,New York Giants,true
regular,1,2026-09-14T20:15:00-04:00,DAL,Dallas Cowboys,CIN,Cincinnati Bengals,true`;
    const result = parseSeasonScheduleText(input, 2026);

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "team_scheduled_twice", severity: "error" }),
      expect.objectContaining({ code: "multiple_week_tiebreakers", severity: "error" }),
    ]));
  });

  it("accepts tab-separated rows and an omitted optional tiebreaker column", () => {
    const input = [
      "season_phase\tweek_number\tkickoff_at\taway_code\taway_name\thome_code\thome_name",
      "pre\t1\t2026-08-06T20:00:00-04:00\tLAC\tLos Angeles Chargers\tDET\tDetroit Lions",
    ].join("\n");
    const result = parseSeasonScheduleText(input, 2026);

    expect(result.delimiter).toBe("tab");
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(result.weeks[0].games[0].isMondayTiebreaker).toBe(true);
  });

  it("requires an explicit tiebreaker when a regular week has no Monday game", () => {
    const input = `season_phase,week_number,kickoff_at,away_code,away_name,home_code,home_name
regular,1,2026-09-10T20:20:00-04:00,DAL,Dallas Cowboys,NYG,New York Giants`;
    const result = parseSeasonScheduleText(input, 2026);

    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "missing_monday_tiebreaker",
      severity: "error",
    }));
    expect(result.weeks).toEqual([]);
  });
});
