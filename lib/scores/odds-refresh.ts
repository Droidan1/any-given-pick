const ODDS_REFRESH_MAX_AGE_MS = 2 * 60 * 60 * 1_000;

export type OddsRefreshGame = {
  odds: { updatedAt: string } | null;
};

export function shouldRefreshUpcomingOdds(
  games: OddsRefreshGame[],
  now = new Date(),
): boolean {
  if (games.length === 0) return false;

  const latestUpdate = Math.max(...games.flatMap((game) => {
    if (!game.odds) return [];
    const updatedAt = new Date(game.odds.updatedAt).getTime();
    return Number.isFinite(updatedAt) ? [updatedAt] : [];
  }));

  if (!Number.isFinite(latestUpdate)) return true;
  return latestUpdate <= now.getTime() - ODDS_REFRESH_MAX_AGE_MS;
}
