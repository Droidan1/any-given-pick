import type { SeasonPhase } from "@/lib/admin/schedule-import";
import type { ProviderSchedule, ProviderScheduleGame, ScheduleProvider } from "./types";

const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const ESPN_SCHEDULE_URL = "https://www.espn.com/nfl/schedule";
const NFL_SCHEDULE_URL = "https://www.nfl.com/schedules";
const REQUEST_TIMEOUT_MS = 8_000;

type EspnTeam = {
  abbreviation?: unknown;
  displayName?: unknown;
};

type EspnCompetitor = {
  homeAway?: unknown;
  team?: EspnTeam;
};

type EspnCompetition = {
  date?: unknown;
  competitors?: unknown;
};

export type EspnEvent = {
  id?: unknown;
  date?: unknown;
  competitions?: unknown;
};

type EspnScoreboard = {
  events?: unknown;
};

type WeekRequest = {
  seasonPhase: SeasonPhase;
  seasonType: 1 | 2;
  weekNumber: number;
};

function normalizeTeamCode(value: string): string {
  const code = value.trim().toLocaleUpperCase("en-US");
  return code === "WSH" ? "WAS" : code;
}

function easternWeekday(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(new Date(isoDate));
}

function requiredString(value: unknown, description: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`The schedule feed is missing ${description}.`);
  }
  return value.trim();
}

function getCompetitors(competition: EspnCompetition): EspnCompetitor[] {
  if (!Array.isArray(competition.competitors)) {
    throw new Error("The schedule feed is missing a game's teams.");
  }
  return competition.competitors as EspnCompetitor[];
}

function getCompetition(event: EspnEvent): EspnCompetition {
  if (!Array.isArray(event.competitions) || event.competitions.length === 0) {
    throw new Error("The schedule feed is missing a game's competition details.");
  }
  return event.competitions[0] as EspnCompetition;
}

export function normalizeEspnWeek(
  events: EspnEvent[],
  request: Pick<WeekRequest, "seasonPhase" | "weekNumber">,
): ProviderScheduleGame[] {
  const games = events.map((event) => {
    const competition = getCompetition(event);
    const competitors = getCompetitors(competition);
    const away = competitors.find((competitor) => competitor.homeAway === "away");
    const home = competitors.find((competitor) => competitor.homeAway === "home");
    if (!away?.team || !home?.team) {
      throw new Error("The schedule feed could not identify both the away and home teams.");
    }

    const eventId = requiredString(event.id, "a game ID");
    const kickoffAt = requiredString(competition.date ?? event.date, "a kickoff time");
    if (!Number.isFinite(Date.parse(kickoffAt))) {
      throw new Error(`The schedule feed returned an invalid kickoff time for game ${eventId}.`);
    }

    return {
      seasonPhase: request.seasonPhase,
      weekNumber: request.weekNumber,
      kickoffAt: new Date(kickoffAt).toISOString(),
      awayTeamCode: normalizeTeamCode(requiredString(away.team.abbreviation, "an away-team code")),
      awayTeamName: requiredString(away.team.displayName, "an away-team name"),
      homeTeamCode: normalizeTeamCode(requiredString(home.team.abbreviation, "a home-team code")),
      homeTeamName: requiredString(home.team.displayName, "a home-team name"),
      isTiebreaker: false,
      providerGameKey: `espn:${eventId}`,
    } satisfies ProviderScheduleGame;
  });

  games.sort((left, right) => Date.parse(left.kickoffAt) - Date.parse(right.kickoffAt));
  if (games.length === 0) return games;

  const mondayGames = request.seasonPhase === "regular"
    ? games.filter((game) => easternWeekday(game.kickoffAt) === "Monday")
    : [];
  const tiebreaker = mondayGames.at(-1) ?? games.at(-1)!;
  return games.map((game) => ({
    ...game,
    isTiebreaker: game.providerGameKey === tiebreaker.providerGameKey,
  }));
}

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function providerGamesToCsv(games: ProviderScheduleGame[]): string {
  const headers = [
    "season_phase",
    "week_number",
    "kickoff_at",
    "away_code",
    "away_name",
    "home_code",
    "home_name",
    "tiebreaker",
    "provider_game_key",
  ];
  const rows = games.map((game) => [
    game.seasonPhase,
    game.weekNumber,
    game.kickoffAt,
    game.awayTeamCode,
    game.awayTeamName,
    game.homeTeamCode,
    game.homeTeamName,
    game.isTiebreaker,
    game.providerGameKey,
  ].map(csvCell).join(","));
  return [headers.join(","), ...rows].join("\n");
}

async function fetchWeek(season: number, request: WeekRequest): Promise<ProviderScheduleGame[]> {
  const query = new URLSearchParams({
    dates: String(season),
    seasontype: String(request.seasonType),
    week: String(request.weekNumber),
    limit: "100",
  });
  const response = await fetch(`${ESPN_SCOREBOARD_URL}?${query}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`The schedule provider returned ${response.status} for ${request.seasonPhase} week ${request.weekNumber}.`);
  }
  const payload = await response.json() as EspnScoreboard;
  if (!Array.isArray(payload.events)) {
    throw new Error(`The schedule provider returned an unreadable ${request.seasonPhase} week ${request.weekNumber}.`);
  }
  const games = normalizeEspnWeek(payload.events as EspnEvent[], request);
  if (games.length === 0) {
    throw new Error(`${request.seasonPhase === "preseason" ? "Preseason" : "Regular season"} week ${request.weekNumber} is not available yet.`);
  }
  return games;
}

async function mapInBatches<T, R>(items: T[], size: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    const batch = items.slice(index, index + size);
    results.push(...await Promise.all(batch.map(mapper)));
  }
  return results;
}

export async function fetchEspnSeasonSchedule(season: number): Promise<ProviderSchedule> {
  const requests: WeekRequest[] = [
    ...Array.from({ length: 4 }, (_, index) => ({
      seasonPhase: "preseason" as const,
      seasonType: 1 as const,
      weekNumber: index + 1,
    })),
    ...Array.from({ length: 18 }, (_, index) => ({
      seasonPhase: "regular" as const,
      seasonType: 2 as const,
      weekNumber: index + 1,
    })),
  ];
  const weeks = await mapInBatches(requests, 6, (request) => fetchWeek(season, request));
  const games = weeks.flat();
  const seenKeys = new Set<string>();
  for (const game of games) {
    if (seenKeys.has(game.providerGameKey)) {
      throw new Error(`The schedule provider returned game ${game.providerGameKey} more than once.`);
    }
    seenKeys.add(game.providerGameKey);
  }

  const warnings: string[] = [];
  if (season === 2026 && games.length !== 321) {
    warnings.push(`The feed currently has ${games.length} games; the complete 2026 preseason and regular season should have 321. Verify the slate before creating drafts.`);
  }

  return {
    provider: "espn",
    providerLabel: "ESPN schedule feed",
    season,
    fetchedAt: new Date().toISOString(),
    sourceUrl: `${ESPN_SCHEDULE_URL}/_/year/${season}`,
    verificationUrl: NFL_SCHEDULE_URL,
    scheduleText: providerGamesToCsv(games),
    weekCount: weeks.length,
    gameCount: games.length,
    warnings,
  };
}

export const espnScheduleProvider: ScheduleProvider = {
  id: "espn",
  label: "ESPN schedule feed",
  fetchSeasonSchedule: fetchEspnSeasonSchedule,
};
