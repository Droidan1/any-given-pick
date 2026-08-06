import {
  validateWeekDetails,
  type NormalizedScheduleGame,
  type ScheduleIssue,
  type SeasonPhase,
} from "./schedule-import";

export type SeasonImportWeek = {
  seasonPhase: SeasonPhase;
  weekNumber: number;
  label: string;
  entryDeadline: string;
  games: NormalizedScheduleGame[];
  tiebreakerSelection: "provided" | "automatic";
};

export type SeasonImportResult = {
  weeks: SeasonImportWeek[];
  issues: ScheduleIssue[];
  delimiter: "comma" | "tab" | null;
  gameCount: number;
};

type RawSeasonGame = Omit<NormalizedScheduleGame, "isMondayTiebreaker"> & {
  row: number;
  tiebreaker: boolean | null;
};

const HEADER_ALIASES = {
  seasonPhase: ["season_phase", "phase", "season_type"],
  weekNumber: ["week_number", "week"],
  kickoffAt: ["kickoff_at", "kickoff", "start_time"],
  awayTeamCode: ["away_code", "away_team_code"],
  awayTeamName: ["away_name", "away_team_name"],
  homeTeamCode: ["home_code", "home_team_code"],
  homeTeamName: ["home_name", "home_team_name"],
  tiebreaker: ["tiebreaker", "monday_tiebreaker", "is_monday_tiebreaker"],
  providerGameKey: ["provider_game_key", "game_key", "source_id"],
} as const;

type HeaderKey = keyof typeof HEADER_ALIASES;

const REQUIRED_HEADERS: HeaderKey[] = [
  "seasonPhase",
  "weekNumber",
  "kickoffAt",
  "awayTeamCode",
  "awayTeamName",
  "homeTeamCode",
  "homeTeamName",
];

function normalizeHeader(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/[\s-]+/g, "_");
}

function parseDelimited(text: string, delimiter: string): { records: string[][]; unclosedQuote: boolean } {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      record.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      record.push(field);
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  record.push(field);
  if (record.some((value) => value.trim())) records.push(record);
  return { records, unclosedQuote: quoted };
}

function headerIndex(headers: string[], key: HeaderKey): number {
  return headers.findIndex((header) => HEADER_ALIASES[key].includes(header as never));
}

function parseSeasonPhase(value: string): SeasonPhase | null {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (["preseason", "pre", "pre-season"].includes(normalized)) return "preseason";
  if (["regular", "reg", "regular-season", "regular season"].includes(normalized)) return "regular";
  return null;
}

function parseOptionalBoolean(value: string): boolean | null | "invalid" {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (!normalized) return null;
  if (["true", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "no", "n", "0"].includes(normalized)) return false;
  return "invalid";
}

function isOffsetDateTime(value: string): boolean {
  return /(?:z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value));
}

function easternWeekday(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(new Date(isoDate));
}

function indianapolisDateParts(date: Date): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Indiana/Indianapolis",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday"));
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday,
  };
}

function zonedLocalToUtc(input: { year: number; month: number; day: number; hour: number }): Date {
  const timeZone = "America/Indiana/Indianapolis";
  let guess = Date.UTC(input.year, input.month - 1, input.day, input.hour);

  for (let pass = 0; pass < 2; pass += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const rendered = Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute"),
      value("second"),
    );
    const intended = Date.UTC(input.year, input.month - 1, input.day, input.hour);
    guess += intended - rendered;
  }

  return new Date(guess);
}

export function defaultWeekDeadline(firstKickoff: string): string {
  const kickoff = new Date(firstKickoff);
  const local = indianapolisDateParts(kickoff);
  const calendarDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const daysSinceWednesday = (local.weekday - 3 + 7) % 7;
  calendarDate.setUTCDate(calendarDate.getUTCDate() - daysSinceWednesday);

  let deadline = zonedLocalToUtc({
    year: calendarDate.getUTCFullYear(),
    month: calendarDate.getUTCMonth() + 1,
    day: calendarDate.getUTCDate(),
    hour: 18,
  });
  if (deadline.getTime() >= kickoff.getTime()) {
    calendarDate.setUTCDate(calendarDate.getUTCDate() - 7);
    deadline = zonedLocalToUtc({
      year: calendarDate.getUTCFullYear(),
      month: calendarDate.getUTCMonth() + 1,
      day: calendarDate.getUTCDate(),
      hour: 18,
    });
  }

  return deadline.toISOString();
}

function chooseTiebreaker(
  seasonPhase: SeasonPhase,
  games: RawSeasonGame[],
  issues: ScheduleIssue[],
  weekNumber: number,
): { selectedIndex: number; selection: "provided" | "automatic" } | null {
  const explicitlySelected = games
    .map((game, index) => ({ game, index }))
    .filter(({ game }) => game.tiebreaker === true);
  if (explicitlySelected.length > 1) {
    issues.push({
      severity: "error",
      code: "multiple_week_tiebreakers",
      row: explicitlySelected[1].game.row,
      field: "tiebreaker",
      message: `${seasonPhase === "preseason" ? "Preseason " : ""}Week ${weekNumber} has more than one tiebreaker.`,
    });
    return null;
  }
  if (explicitlySelected.length === 1) {
    return { selectedIndex: explicitlySelected[0].index, selection: "provided" };
  }

  const mondayGames = seasonPhase === "regular"
    ? games.map((game, index) => ({ game, index })).filter(({ game }) => easternWeekday(game.kickoffAt) === "Monday")
    : [];
  if (seasonPhase === "regular" && mondayGames.length === 0) {
    issues.push({
      severity: "error",
      code: "missing_monday_tiebreaker",
      row: games[games.length - 1]?.row,
      field: "tiebreaker",
      message: `Week ${weekNumber} has no Monday game. Mark one row as the tiebreaker before importing.`,
    });
    return null;
  }
  const selectedIndex = seasonPhase === "regular"
    ? mondayGames[mondayGames.length - 1].index
    : games.length - 1;
  issues.push({
    severity: "warning",
    code: "automatic_tiebreaker",
    row: games[selectedIndex]?.row,
    field: "tiebreaker",
    message: `${seasonPhase === "preseason" ? "Preseason " : ""}Week ${weekNumber} uses its ${seasonPhase === "regular" ? "latest Monday" : "latest"} game as the automatic tiebreaker.`,
  });
  return { selectedIndex, selection: "automatic" };
}

export function parseSeasonScheduleText(rawText: string, season: number): SeasonImportResult {
  const text = rawText.replace(/^\uFEFF/, "").trim();
  if (!text) {
    return {
      weeks: [],
      issues: [{ severity: "error", code: "empty_schedule", message: "Paste or open a season schedule to continue." }],
      delimiter: null,
      gameCount: 0,
    };
  }

  const delimiterCharacter = text.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
  const delimiter = delimiterCharacter === "\t" ? "tab" : "comma";
  const parsed = parseDelimited(text, delimiterCharacter);
  const issues: ScheduleIssue[] = [];

  if (parsed.unclosedQuote) {
    issues.push({ severity: "error", code: "unclosed_quote", message: "The schedule contains an unclosed quoted field." });
  }
  if (parsed.records.length < 2) {
    issues.push({ severity: "error", code: "missing_rows", message: "Include a header row and at least one game." });
    return { weeks: [], issues, delimiter, gameCount: 0 };
  }

  const headers = parsed.records[0].map(normalizeHeader);
  const indexes = Object.fromEntries(
    (Object.keys(HEADER_ALIASES) as HeaderKey[]).map((key) => [key, headerIndex(headers, key)]),
  ) as Record<HeaderKey, number>;
  for (const key of REQUIRED_HEADERS) {
    if (indexes[key] === -1) {
      issues.push({
        severity: "error",
        code: "missing_header",
        field: HEADER_ALIASES[key][0],
        message: `Missing required column: ${HEADER_ALIASES[key][0]}.`,
      });
    }
  }
  if (issues.some((issue) => issue.code === "missing_header")) {
    return { weeks: [], issues, delimiter, gameCount: 0 };
  }

  const groups = new Map<string, { seasonPhase: SeasonPhase; weekNumber: number; games: RawSeasonGame[] }>();
  const seenGames = new Set<string>();
  const seenProviderKeys = new Set<string>();

  parsed.records.slice(1).forEach((record, recordIndex) => {
    const row = recordIndex + 2;
    const issueStart = issues.length;
    const value = (key: HeaderKey) => (indexes[key] >= 0 ? (record[indexes[key]] ?? "").trim() : "");
    const seasonPhase = parseSeasonPhase(value("seasonPhase"));
    const weekNumber = Number(value("weekNumber"));
    const kickoffAt = value("kickoffAt");
    const awayTeamCode = value("awayTeamCode").toLocaleUpperCase("en-US");
    const awayTeamName = value("awayTeamName");
    const homeTeamCode = value("homeTeamCode").toLocaleUpperCase("en-US");
    const homeTeamName = value("homeTeamName");
    const tiebreaker = parseOptionalBoolean(value("tiebreaker"));
    const providerGameKey = value("providerGameKey") || null;

    if (!seasonPhase) {
      issues.push({ severity: "error", code: "invalid_phase", row, field: "season_phase", message: "Season phase must be preseason or regular." });
    }
    const maximumWeek = seasonPhase === "preseason" ? 4 : 22;
    if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > maximumWeek) {
      issues.push({ severity: "error", code: "invalid_week", row, field: "week_number", message: `Week must be a whole number from 1 to ${maximumWeek}.` });
    }
    if (!isOffsetDateTime(kickoffAt)) {
      issues.push({ severity: "error", code: "invalid_kickoff", row, field: "kickoff_at", message: "Kickoff must be an ISO date-time with Z or a UTC offset." });
    }
    for (const [field, code] of [["away_code", awayTeamCode], ["home_code", homeTeamCode]] as const) {
      if (!/^[A-Z0-9]{2,5}$/.test(code)) {
        issues.push({ severity: "error", code: "invalid_team_code", row, field, message: `${field === "away_code" ? "Away" : "Home"} code must be 2–5 letters or numbers.` });
      }
    }
    for (const [field, name] of [["away_name", awayTeamName], ["home_name", homeTeamName]] as const) {
      if (name.length < 2 || name.length > 80) {
        issues.push({ severity: "error", code: "invalid_team_name", row, field, message: `${field === "away_name" ? "Away" : "Home"} name must be 2–80 characters.` });
      }
    }
    if (awayTeamCode && awayTeamCode === homeTeamCode) {
      issues.push({ severity: "error", code: "same_team", row, message: "Away and home teams must be different." });
    }
    if (tiebreaker === "invalid") {
      issues.push({ severity: "error", code: "invalid_tiebreaker", row, field: "tiebreaker", message: "Tiebreaker must be blank, true/false, yes/no, or 1/0." });
    }

    const duplicateKey = `${awayTeamCode}|${homeTeamCode}|${kickoffAt}`;
    if (seenGames.has(duplicateKey)) {
      issues.push({ severity: "error", code: "duplicate_game", row, message: "This matchup and kickoff are duplicated in the season file." });
    }
    seenGames.add(duplicateKey);
    if (providerGameKey) {
      if (seenProviderKeys.has(providerGameKey)) {
        issues.push({ severity: "error", code: "duplicate_provider_key", row, field: "provider_game_key", message: "Provider game keys must be unique in the season file." });
      }
      seenProviderKeys.add(providerGameKey);
    }
    if (issues.slice(issueStart).some((issue) => issue.severity === "error")) return;

    const key = `${seasonPhase}:${weekNumber}`;
    const group = groups.get(key) ?? { seasonPhase: seasonPhase!, weekNumber, games: [] };
    group.games.push({
      row,
      kickoffAt: new Date(kickoffAt).toISOString(),
      awayTeamCode,
      awayTeamName,
      homeTeamCode,
      homeTeamName,
      tiebreaker: tiebreaker as boolean | null,
      providerGameKey,
    });
    groups.set(key, group);
  });

  const weeks: SeasonImportWeek[] = [];
  for (const group of groups.values()) {
    group.games.sort((left, right) => Date.parse(left.kickoffAt) - Date.parse(right.kickoffAt));
    const teamRows = new Map<string, number>();
    for (const game of group.games) {
      for (const code of [game.awayTeamCode, game.homeTeamCode]) {
        const previousRow = teamRows.get(code);
        if (previousRow) {
          issues.push({
            severity: "error",
            code: "team_scheduled_twice",
            row: game.row,
            message: `${code} appears twice in ${group.seasonPhase === "preseason" ? "Preseason " : ""}Week ${group.weekNumber} (rows ${previousRow} and ${game.row}).`,
          });
        } else {
          teamRows.set(code, game.row);
        }
      }
    }

    const tiebreaker = chooseTiebreaker(group.seasonPhase, group.games, issues, group.weekNumber);
    if (!tiebreaker || group.games.length === 0) continue;
    const normalizedGames = group.games.map((game, index) => ({
      kickoffAt: game.kickoffAt,
      awayTeamCode: game.awayTeamCode,
      awayTeamName: game.awayTeamName,
      homeTeamCode: game.homeTeamCode,
      homeTeamName: game.homeTeamName,
      isMondayTiebreaker: index === tiebreaker.selectedIndex,
      providerGameKey: game.providerGameKey,
    }));
    const entryDeadline = defaultWeekDeadline(normalizedGames[0].kickoffAt);
    const validationIssues = validateWeekDetails(
      { season, seasonPhase: group.seasonPhase, weekNumber: group.weekNumber, label: "", entryDeadline },
      normalizedGames,
    );
    issues.push(...validationIssues);
    weeks.push({
      seasonPhase: group.seasonPhase,
      weekNumber: group.weekNumber,
      label: "",
      entryDeadline,
      games: normalizedGames,
      tiebreakerSelection: tiebreaker.selection,
    });
  }

  weeks.sort((left, right) => {
    if (left.seasonPhase !== right.seasonPhase) return left.seasonPhase === "preseason" ? -1 : 1;
    return left.weekNumber - right.weekNumber;
  });
  return {
    weeks,
    issues,
    delimiter,
    gameCount: weeks.reduce((total, week) => total + week.games.length, 0),
  };
}

export const SEASON_SCHEDULE_TEMPLATE = `season_phase,week_number,kickoff_at,away_code,away_name,home_code,home_name,tiebreaker,provider_game_key
preseason,1,2026-08-06T20:00:00-04:00,LAC,Los Angeles Chargers,DET,Detroit Lions,,pre-001
preseason,1,2026-08-09T16:00:00-04:00,IND,Indianapolis Colts,MIN,Minnesota Vikings,true,pre-002
preseason,2,2026-08-13T19:00:00-04:00,PHI,Philadelphia Eagles,CLE,Cleveland Browns,,pre-003
regular,1,2026-09-10T20:20:00-04:00,DAL,Dallas Cowboys,NYG,New York Giants,,reg-001
regular,1,2026-09-14T20:15:00-04:00,BAL,Baltimore Ravens,CIN,Cincinnati Bengals,,reg-002
regular,2,2026-09-20T13:00:00-04:00,CHI,Chicago Bears,GB,Green Bay Packers,,reg-003
regular,2,2026-09-21T20:15:00-04:00,BUF,Buffalo Bills,NYJ,New York Jets,,reg-004`;
