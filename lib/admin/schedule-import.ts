export type ScheduleIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  row?: number;
  field?: string;
};

export type NormalizedScheduleGame = {
  kickoffAt: string;
  awayTeamCode: string;
  awayTeamName: string;
  homeTeamCode: string;
  homeTeamName: string;
  isMondayTiebreaker: boolean;
  providerGameKey: string | null;
};

export type ScheduleParseResult = {
  games: NormalizedScheduleGame[];
  issues: ScheduleIssue[];
  delimiter: "comma" | "tab" | null;
};

export type WeekDetailsInput = {
  season: number;
  weekNumber: number;
  label: string;
  entryDeadline: string;
};

const HEADER_ALIASES = {
  kickoffAt: ["kickoff_at", "kickoff", "start_time"],
  awayTeamCode: ["away_code", "away_team_code"],
  awayTeamName: ["away_name", "away_team_name"],
  homeTeamCode: ["home_code", "home_team_code"],
  homeTeamName: ["home_name", "home_team_name"],
  isMondayTiebreaker: ["monday_tiebreaker", "is_monday_tiebreaker", "tiebreaker"],
  providerGameKey: ["provider_game_key", "game_key", "source_id"],
} as const;

type HeaderKey = keyof typeof HEADER_ALIASES;

const REQUIRED_HEADERS: HeaderKey[] = [
  "kickoffAt",
  "awayTeamCode",
  "awayTeamName",
  "homeTeamCode",
  "homeTeamName",
  "isMondayTiebreaker",
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

function parseBoolean(value: string): boolean | null {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (["true", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "no", "n", "0", ""].includes(normalized)) return false;
  return null;
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

export function parseScheduleText(rawText: string): ScheduleParseResult {
  const text = rawText.replace(/^\uFEFF/, "").trim();
  if (!text) {
    return {
      games: [],
      issues: [{ severity: "error", code: "empty_schedule", message: "Paste a schedule to continue." }],
      delimiter: null,
    };
  }

  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const parsed = parseDelimited(text, delimiter);
  const issues: ScheduleIssue[] = [];

  if (parsed.unclosedQuote) {
    issues.push({
      severity: "error",
      code: "unclosed_quote",
      message: "The schedule contains an unclosed quoted field.",
    });
  }

  if (parsed.records.length < 2) {
    issues.push({
      severity: "error",
      code: "missing_rows",
      message: "Include a header row and at least one game.",
    });
    return { games: [], issues, delimiter: delimiter === "\t" ? "tab" : "comma" };
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
    return { games: [], issues, delimiter: delimiter === "\t" ? "tab" : "comma" };
  }

  const games: NormalizedScheduleGame[] = [];
  const seenGames = new Set<string>();

  parsed.records.slice(1).forEach((record, recordIndex) => {
    const row = recordIndex + 2;
    const rowIssueStart = issues.length;
    const value = (key: HeaderKey) => (indexes[key] >= 0 ? (record[indexes[key]] ?? "").trim() : "");
    const kickoffAt = value("kickoffAt");
    const awayTeamCode = value("awayTeamCode").toLocaleUpperCase("en-US");
    const awayTeamName = value("awayTeamName");
    const homeTeamCode = value("homeTeamCode").toLocaleUpperCase("en-US");
    const homeTeamName = value("homeTeamName");
    const tiebreaker = parseBoolean(value("isMondayTiebreaker"));
    const providerGameKey = value("providerGameKey") || null;

    if (!isOffsetDateTime(kickoffAt)) {
      issues.push({
        severity: "error",
        code: "invalid_kickoff",
        row,
        field: "kickoff_at",
        message: "Kickoff must be an ISO date-time with Z or a UTC offset.",
      });
    }
    for (const [field, code] of [
      ["away_code", awayTeamCode],
      ["home_code", homeTeamCode],
    ] as const) {
      if (!/^[A-Z0-9]{2,5}$/.test(code)) {
        issues.push({
          severity: "error",
          code: "invalid_team_code",
          row,
          field,
          message: `${field === "away_code" ? "Away" : "Home"} code must be 2–5 letters or numbers.`,
        });
      }
    }
    for (const [field, name] of [
      ["away_name", awayTeamName],
      ["home_name", homeTeamName],
    ] as const) {
      if (name.length < 2 || name.length > 80) {
        issues.push({
          severity: "error",
          code: "invalid_team_name",
          row,
          field,
          message: `${field === "away_name" ? "Away" : "Home"} name must be 2–80 characters.`,
        });
      }
    }
    if (awayTeamCode && awayTeamCode === homeTeamCode) {
      issues.push({
        severity: "error",
        code: "same_team",
        row,
        message: "Away and home teams must be different.",
      });
    }
    if (tiebreaker === null) {
      issues.push({
        severity: "error",
        code: "invalid_tiebreaker",
        row,
        field: "monday_tiebreaker",
        message: "Tiebreaker must be true/false, yes/no, or 1/0.",
      });
    }

    const duplicateKey = `${awayTeamCode}|${homeTeamCode}|${kickoffAt}`;
    if (seenGames.has(duplicateKey)) {
      issues.push({
        severity: "error",
        code: "duplicate_game",
        row,
        message: "This matchup and kickoff are duplicated.",
      });
    }
    seenGames.add(duplicateKey);

    if (issues.slice(rowIssueStart).some((issue) => issue.severity === "error")) return;

    const normalizedGame = {
      kickoffAt: new Date(kickoffAt).toISOString(),
      awayTeamCode,
      awayTeamName,
      homeTeamCode,
      homeTeamName,
      isMondayTiebreaker: Boolean(tiebreaker),
      providerGameKey,
    };
    games.push(normalizedGame);

    if (normalizedGame.isMondayTiebreaker && easternWeekday(normalizedGame.kickoffAt) !== "Monday") {
      issues.push({
        severity: "warning",
        code: "tiebreaker_not_monday",
        row,
        message: "The designated tiebreaker does not kick off on Monday in Eastern Time.",
      });
    }
  });

  const tiebreakerCount = games.filter((game) => game.isMondayTiebreaker).length;
  if (games.length > 0 && tiebreakerCount !== 1) {
    issues.push({
      severity: "error",
      code: "tiebreaker_count",
      field: "monday_tiebreaker",
      message: `Exactly one game must be the Monday tiebreaker; found ${tiebreakerCount}.`,
    });
  }

  games.sort((left, right) => Date.parse(left.kickoffAt) - Date.parse(right.kickoffAt));
  return { games, issues, delimiter: delimiter === "\t" ? "tab" : "comma" };
}

export function validateWeekDetails(
  details: WeekDetailsInput,
  games: NormalizedScheduleGame[],
): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];
  const currentYear = new Date().getUTCFullYear();

  if (!Number.isInteger(details.season) || details.season < currentYear - 1 || details.season > currentYear + 2) {
    issues.push({
      severity: "error",
      code: "invalid_season",
      field: "season",
      message: `Season must be between ${currentYear - 1} and ${currentYear + 2}.`,
    });
  }
  if (!Number.isInteger(details.weekNumber) || details.weekNumber < 1 || details.weekNumber > 22) {
    issues.push({
      severity: "error",
      code: "invalid_week",
      field: "week_number",
      message: "Week must be a whole number from 1 to 22.",
    });
  }
  if (details.label.length > 80) {
    issues.push({
      severity: "error",
      code: "invalid_label",
      field: "label",
      message: "Week label cannot exceed 80 characters.",
    });
  }
  if (!isOffsetDateTime(details.entryDeadline)) {
    issues.push({
      severity: "error",
      code: "invalid_deadline",
      field: "entry_deadline",
      message: "Entry deadline must include a UTC offset.",
    });
  } else {
    const deadline = Date.parse(details.entryDeadline);
    for (const [index, game] of games.entries()) {
      if (Date.parse(game.kickoffAt) <= deadline) {
        issues.push({
          severity: "error",
          code: "kickoff_before_deadline",
          row: index + 2,
          field: "kickoff_at",
          message: "Every kickoff must be after the entry deadline.",
        });
      }
    }
  }

  return issues;
}

export const SCHEDULE_TEMPLATE = `kickoff_at,away_code,away_name,home_code,home_name,monday_tiebreaker,provider_game_key
2026-09-11T20:20:00-04:00,DAL,Dallas Cowboys,PHI,Philadelphia Eagles,false,example-001
2026-09-14T20:15:00-04:00,BAL,Baltimore Ravens,CLE,Cleveland Browns,true,example-002`;
