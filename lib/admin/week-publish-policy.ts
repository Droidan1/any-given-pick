export type PublishableGame = {
  awayTeamCode: string;
  homeTeamCode: string;
  isMondayTiebreaker: boolean;
};

export function validatePublishableSlate(
  seasonPhase: "preseason" | "regular",
  games: PublishableGame[],
): string[] {
  const issues: string[] = [];
  const expectedGameCount = seasonPhase === "preseason" ? 16 : null;

  if (expectedGameCount !== null && games.length !== expectedGameCount) {
    issues.push(`A preseason week must contain exactly ${expectedGameCount} games.`);
  }
  if (seasonPhase === "regular" && (games.length < 13 || games.length > 16)) {
    issues.push("A regular-season week must contain between 13 and 16 games.");
  }

  const teamAppearances = new Map<string, number>();
  for (const game of games) {
    teamAppearances.set(game.awayTeamCode, (teamAppearances.get(game.awayTeamCode) ?? 0) + 1);
    teamAppearances.set(game.homeTeamCode, (teamAppearances.get(game.homeTeamCode) ?? 0) + 1);
  }
  const duplicateTeams = [...teamAppearances]
    .filter(([, count]) => count > 1)
    .map(([team]) => team)
    .sort();
  if (duplicateTeams.length > 0) {
    issues.push(`Each team can appear only once. Repeated: ${duplicateTeams.join(", ")}.`);
  }

  const tiebreakerCount = games.filter((game) => game.isMondayTiebreaker).length;
  if (tiebreakerCount !== 1) {
    issues.push(
      seasonPhase === "preseason"
        ? "Designate exactly one preseason tiebreaker game."
        : "Designate exactly one Monday tiebreaker.",
    );
  }

  return issues;
}
