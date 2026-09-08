import { getEspnWeekParameters } from "../admin/schedule-providers/espn";
import type { SeasonPhase } from "../admin/schedule-import";

const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const REQUEST_TIMEOUT_MS = 8_000;

export type ProviderGameStatus = "scheduled" | "in_progress" | "final" | "postponed" | "canceled";

export type EspnGameResult = {
  providerGameKey: string;
  status: ProviderGameStatus;
  awayScore: number | null;
  homeScore: number | null;
  awayMoneyline: number | null;
  homeMoneyline: number | null;
  overUnder: number | null;
  oddsProvider: string | null;
};

type EspnStatus = {
  type?: {
    name?: unknown;
    state?: unknown;
    completed?: unknown;
  };
};

type EspnCompetitor = {
  homeAway?: unknown;
  score?: unknown;
};

export type EspnScoreEvent = {
  id?: unknown;
  status?: EspnStatus;
  competitions?: unknown;
};

type EspnOdds = {
  provider?: { displayName?: unknown; name?: unknown };
  overUnder?: unknown;
  moneyline?: {
    away?: { close?: { odds?: unknown } };
    home?: { close?: { odds?: unknown } };
  };
};

type EspnScoreboard = {
  events?: unknown;
};

function gameStatus(status: EspnStatus | undefined): ProviderGameStatus {
  const name = typeof status?.type?.name === "string"
    ? status.type.name.toLocaleUpperCase("en-US")
    : "";
  const state = typeof status?.type?.state === "string"
    ? status.type.state.toLocaleLowerCase("en-US")
    : "";

  if (name.includes("CANCELED") || name.includes("CANCELLED")) return "canceled";
  if (name.includes("POSTPONED")) return "postponed";
  if (status?.type?.completed === true || state === "post") return "final";
  if (state === "in") return "in_progress";
  return "scheduled";
}

function score(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function americanOdds(value: unknown): number | null {
  if (typeof value === "string" && ["EV", "EVEN"].includes(value.trim().toLocaleUpperCase("en-US"))) {
    return 100;
  }
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && Math.abs(parsed) >= 100 && Math.abs(parsed) <= 100_000
    ? parsed
    : null;
}

function gameTotal(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 200 ? parsed : null;
}

function providerName(odds: EspnOdds | undefined): string | null {
  const value = odds?.provider?.displayName ?? odds?.provider?.name;
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 48) : null;
}

export function normalizeEspnScores(events: EspnScoreEvent[]): EspnGameResult[] {
  return events.flatMap((event) => {
    if (typeof event.id !== "string" || !event.id.trim()) return [];
    if (!Array.isArray(event.competitions) || event.competitions.length === 0) return [];

    const competition = event.competitions[0] as {
      status?: EspnStatus;
      competitors?: unknown;
      odds?: unknown;
    };
    if (!Array.isArray(competition.competitors)) return [];

    const competitors = competition.competitors as EspnCompetitor[];
    const away = competitors.find((competitor) => competitor.homeAway === "away");
    const home = competitors.find((competitor) => competitor.homeAway === "home");
    if (!away || !home) return [];

    const status = gameStatus(competition.status ?? event.status);
    const odds = Array.isArray(competition.odds)
      ? competition.odds[0] as EspnOdds | undefined
      : undefined;
    return [{
      providerGameKey: `espn:${event.id.trim()}`,
      status,
      awayScore: status === "scheduled" ? null : score(away.score),
      homeScore: status === "scheduled" ? null : score(home.score),
      awayMoneyline: americanOdds(odds?.moneyline?.away?.close?.odds),
      homeMoneyline: americanOdds(odds?.moneyline?.home?.close?.odds),
      overUnder: gameTotal(odds?.overUnder),
      oddsProvider: providerName(odds),
    }];
  });
}

export async function fetchEspnWeekScores(input: {
  season: number;
  seasonPhase: SeasonPhase;
  weekNumber: number;
}): Promise<EspnGameResult[]> {
  const parameters = getEspnWeekParameters(input.seasonPhase, input.weekNumber);
  const query = new URLSearchParams({
    dates: String(input.season),
    seasontype: String(parameters.seasonType),
    week: String(parameters.providerWeekNumber),
    limit: "100",
  });
  const response = await fetch(`${ESPN_SCOREBOARD_URL}?${query}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`ESPN returned ${response.status} for ${input.seasonPhase} week ${input.weekNumber}.`);
  }

  const payload = await response.json() as EspnScoreboard;
  if (!Array.isArray(payload.events)) {
    throw new Error(`ESPN returned unreadable scores for ${input.seasonPhase} week ${input.weekNumber}.`);
  }
  return normalizeEspnScores(payload.events as EspnScoreEvent[]);
}
