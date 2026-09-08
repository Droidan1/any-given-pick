export type BoardSettings = {
  multipleBoardsEnabled: boolean;
  maxBoards: number;
  revision: number;
};

export function boardLimit(settings: BoardSettings): number {
  return settings.multipleBoardsEnabled ? settings.maxBoards : 1;
}

export type ScoredBoard = {
  userId: string;
  weekId: string;
  boardNumber: number;
  correctPicks: number;
  tiebreakerDiff: number | null;
};

/** Each player's best board is chosen independently for each contest week. */
export function bestBoardsPerWeek<T extends ScoredBoard>(boards: T[]): T[] {
  const best = new Map<string, T>();
  for (const board of boards) {
    const key = `${board.userId}:${board.weekId}`;
    const previous = best.get(key);
    if (!previous || compareBoards(board, previous) < 0) best.set(key, board);
  }
  return [...best.values()];
}

function compareBoards(a: ScoredBoard, b: ScoredBoard): number {
  if (a.correctPicks !== b.correctPicks) return b.correctPicks - a.correctPicks;
  const aDiff = a.tiebreakerDiff ?? Infinity;
  const bDiff = b.tiebreakerDiff ?? Infinity;
  if (aDiff !== bDiff) return aDiff < bDiff ? -1 : 1;
  return a.boardNumber - b.boardNumber;
}
