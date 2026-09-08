import { describe, expect, it } from "vitest";
import { normalizeEspnScores, type EspnScoreEvent } from "./espn";

function event(input: {
  id?: string;
  state: string;
  name: string;
  completed: boolean;
  awayScore?: string;
  homeScore?: string;
  awayMoneyline?: string;
  homeMoneyline?: string;
  overUnder?: number;
  oddsProvider?: string;
}): EspnScoreEvent {
  const status = {
    type: {
      state: input.state,
      name: input.name,
      completed: input.completed,
    },
  };
  return {
    id: input.id,
    status,
    competitions: [{
      status,
      competitors: [
        { homeAway: "home", score: input.homeScore },
        { homeAway: "away", score: input.awayScore },
      ],
      odds: input.awayMoneyline || input.homeMoneyline || input.overUnder
        ? [{
            provider: { displayName: input.oddsProvider },
            overUnder: input.overUnder,
            moneyline: {
              away: { close: { odds: input.awayMoneyline } },
              home: { close: { odds: input.homeMoneyline } },
            },
          }]
        : [],
    }],
  };
}

describe("ESPN score normalization", () => {
  it("reads a completed game and keeps home and away scores aligned", () => {
    expect(normalizeEspnScores([event({
      id: "401772510",
      state: "post",
      name: "STATUS_FINAL",
      completed: true,
      awayScore: "20",
      homeScore: "24",
    })])).toEqual([{
      providerGameKey: "espn:401772510",
      status: "final",
      awayScore: 20,
      homeScore: 24,
      awayMoneyline: null,
      homeMoneyline: null,
      overUnder: null,
      oddsProvider: null,
    }]);
  });

  it("reads only the current moneylines, total, and provider attribution", () => {
    expect(normalizeEspnScores([event({
      id: "401772511",
      state: "pre",
      name: "STATUS_SCHEDULED",
      completed: false,
      awayMoneyline: "+145",
      homeMoneyline: "-170",
      overUnder: 44.5,
      oddsProvider: "DraftKings",
    })])).toEqual([expect.objectContaining({
      providerGameKey: "espn:401772511",
      awayMoneyline: 145,
      homeMoneyline: -170,
      overUnder: 44.5,
      oddsProvider: "DraftKings",
    })]);
  });

  it("maps live, postponed, and canceled states without inventing scores", () => {
    const results = normalizeEspnScores([
      event({ id: "live", state: "in", name: "STATUS_IN_PROGRESS", completed: false, awayScore: "7", homeScore: "10" }),
      event({ id: "late", state: "pre", name: "STATUS_POSTPONED", completed: false }),
      event({ id: "off", state: "post", name: "STATUS_CANCELED", completed: false }),
    ]);

    expect(results).toEqual([
      expect.objectContaining({ providerGameKey: "espn:live", status: "in_progress", awayScore: 7, homeScore: 10 }),
      expect.objectContaining({ providerGameKey: "espn:late", status: "postponed" }),
      expect.objectContaining({ providerGameKey: "espn:off", status: "canceled" }),
    ]);
  });

  it("skips malformed events", () => {
    expect(normalizeEspnScores([
      event({ state: "post", name: "STATUS_FINAL", completed: true, awayScore: "3", homeScore: "7" }),
      { id: "missing-competition", competitions: [] },
    ])).toEqual([]);
  });
});
