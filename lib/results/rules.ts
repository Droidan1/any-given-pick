export function canRevealWeeklyPicks(entryDeadline: Date, serverNow: Date): boolean {
  return serverNow.getTime() >= entryDeadline.getTime();
}

export type PickDistribution = {
  gameId: string;
  awayTeamCode: string;
  homeTeamCode: string;
  awayCount: number;
  homeCount: number;
  totalPicks: number;
  awayPercent: number;
  homePercent: number;
};

export function buildPickDistributions(
  games: Array<{ id: string; awayTeamCode: string; homeTeamCode: string }>,
  picks: Array<{ gameId: string; selectedTeamCode: string }>,
): PickDistribution[] {
  const picksByGame = new Map<string, string[]>();
  for (const pick of picks) {
    const gamePicks = picksByGame.get(pick.gameId) ?? [];
    gamePicks.push(pick.selectedTeamCode);
    picksByGame.set(pick.gameId, gamePicks);
  }

  return games.map((game) => {
    const gamePicks = picksByGame.get(game.id) ?? [];
    const awayCount = gamePicks.filter((pick) => pick === game.awayTeamCode).length;
    const homeCount = gamePicks.filter((pick) => pick === game.homeTeamCode).length;
    const totalPicks = awayCount + homeCount;
    const awayPercent = totalPicks === 0 ? 0 : Math.round((awayCount / totalPicks) * 100);
    return {
      gameId: game.id,
      awayTeamCode: game.awayTeamCode,
      homeTeamCode: game.homeTeamCode,
      awayCount,
      homeCount,
      totalPicks,
      awayPercent,
      homePercent: totalPicks === 0 ? 0 : 100 - awayPercent,
    };
  });
}
