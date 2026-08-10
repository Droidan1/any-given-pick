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

export function normalizeEspnScores(events: EspnScoreEvent[]): EspnGameResult[] {
  return events.flatMap((event) => {
    if (typeof event.id !== "string" || !event.id.trim()) return [];
    if (!Array.isArray(event.competitions) || event.competitions.length === 0) return [];

    const competition = event.competitions[0] as {
      status?: EspnStatus;
      competitors?: unknown;
    };
    if (!Array.isArray(competition.competitors)) return [];

    const competitors = competition.competitors as EspnCompetitor[];
    const away = competitors.find((competitor) => competitor.homeAway === "away");
    const home = competitors.find((competitor) => competitor.homeAway === "home");
    if (!away || !home) return [];

    const status = gameStatus(competition.status ?? event.status);
    return [{
      providerGameKey: `espn:${event.id.trim()}`,
      status,
      awayScore: status === "scheduled" ? null : score(away.score),
      homeScore: status === "scheduled" ? null : score(home.score),
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
