import type { StandingRow, UnrankedStanding } from "./types";

function comparableTiebreaker(value: number | null) {
  return value ?? Number.POSITIVE_INFINITY;
}

export function rankStandings(rows: UnrankedStanding[]): StandingRow[] {
  const sorted = rows.toSorted((left, right) => {
    if (left.correctPicks !== right.correctPicks) {
      return right.correctPicks - left.correctPicks;
    }
    const leftTiebreaker = comparableTiebreaker(left.tiebreakerDiff);
    const rightTiebreaker = comparableTiebreaker(right.tiebreakerDiff);
    if (leftTiebreaker !== rightTiebreaker) {
      return leftTiebreaker < rightTiebreaker ? -1 : 1;
    }
    return left.displayName.localeCompare(right.displayName, "en-US");
  });

  let previous: UnrankedStanding | null = null;
  let rank = 0;
  return sorted.map((row, index) => {
    if (
      !previous ||
      row.correctPicks !== previous.correctPicks ||
      comparableTiebreaker(row.tiebreakerDiff) !== comparableTiebreaker(previous.tiebreakerDiff)
    ) {
      rank = index + 1;
    }
    previous = row;
    return { ...row, rank };
  });
}
