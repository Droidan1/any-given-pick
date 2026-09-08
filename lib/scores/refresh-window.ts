const REFRESH_LEAD_MS = 15 * 60 * 1_000;
const REFRESH_TRAIL_MS = 6 * 60 * 60 * 1_000;

export type RefreshableGame = {
  kickoffAt: string;
  gameStatus: "scheduled" | "in_progress" | "final" | "postponed" | "canceled";
};

export function isScoreRefreshWindow(game: RefreshableGame, now = new Date()): boolean {
  if (game.gameStatus === "in_progress") return true;
  if (game.gameStatus !== "scheduled") return false;

  const kickoffAt = new Date(game.kickoffAt).getTime();
  if (!Number.isFinite(kickoffAt)) return false;

  const currentTime = now.getTime();
  return currentTime >= kickoffAt - REFRESH_LEAD_MS
    && currentTime <= kickoffAt + REFRESH_TRAIL_MS;
}

export function hasScoreRefreshWindow(games: RefreshableGame[], now = new Date()): boolean {
  return games.some((game) => isScoreRefreshWindow(game, now));
}

export function nextScoreRefreshWindow(games: RefreshableGame[], now = new Date()): string | null {
  const currentTime = now.getTime();
  let nextWindowStart = Number.POSITIVE_INFINITY;

  for (const game of games) {
    if (game.gameStatus !== "scheduled") continue;
    const kickoffAt = new Date(game.kickoffAt).getTime();
    const windowStart = kickoffAt - REFRESH_LEAD_MS;
    if (Number.isFinite(windowStart) && windowStart > currentTime && windowStart < nextWindowStart) {
      nextWindowStart = windowStart;
    }
  }

  return Number.isFinite(nextWindowStart) ? new Date(nextWindowStart).toISOString() : null;
}
