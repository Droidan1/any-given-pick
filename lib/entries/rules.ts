export type EntryGameRule = {
  id: string;
  awayTeamCode: string;
  homeTeamCode: string;
};

export type EntryValidationIssue = {
  code: "unknown_game" | "invalid_team" | "missing_pick" | "invalid_monday_prediction";
  gameId?: string;
};

export function validateEntrySelections(input: {
  games: EntryGameRule[];
  picks: Record<string, string>;
  mondayPrediction: number | null;
  requireComplete: boolean;
}): { picks: Record<string, string>; issues: EntryValidationIssue[] } {
  const gameById = new Map(input.games.map((game) => [game.id, game]));
  const picks: Record<string, string> = {};
  const issues: EntryValidationIssue[] = [];

  for (const [gameId, rawTeamCode] of Object.entries(input.picks)) {
    const game = gameById.get(gameId);
    if (!game) {
      issues.push({ code: "unknown_game", gameId });
      continue;
    }

    const teamCode = rawTeamCode.trim().toLocaleUpperCase("en-US");
    if (teamCode !== game.awayTeamCode && teamCode !== game.homeTeamCode) {
      issues.push({ code: "invalid_team", gameId });
      continue;
    }
    picks[gameId] = teamCode;
  }

  if (input.requireComplete) {
    for (const game of input.games) {
      if (!picks[game.id]) issues.push({ code: "missing_pick", gameId: game.id });
    }
  }

  if (
    input.mondayPrediction !== null &&
    (!Number.isInteger(input.mondayPrediction) || input.mondayPrediction < 0 || input.mondayPrediction > 200)
  ) {
    issues.push({ code: "invalid_monday_prediction" });
  } else if (input.requireComplete && input.mondayPrediction === null) {
    issues.push({ code: "invalid_monday_prediction" });
  }

  return { picks, issues };
}
