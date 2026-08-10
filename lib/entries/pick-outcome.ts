export type PickOutcome = "pending" | "won" | "lost" | "tie" | "no_pick";

export function calculatePickOutcome(input: {
  gameStatus: "scheduled" | "in_progress" | "final" | "postponed" | "canceled";
  awayScore: number | null;
  homeScore: number | null;
  awayTeamCode: string;
  homeTeamCode: string;
  selectedTeamCode: string | null;
}): PickOutcome {
  if (input.gameStatus !== "final" || input.awayScore === null || input.homeScore === null) {
    return "pending";
  }
  if (!input.selectedTeamCode) return "no_pick";
  if (input.awayScore === input.homeScore) return "tie";

  const winningTeamCode = input.awayScore > input.homeScore
    ? input.awayTeamCode
    : input.homeTeamCode;
  return input.selectedTeamCode === winningTeamCode ? "won" : "lost";
}
