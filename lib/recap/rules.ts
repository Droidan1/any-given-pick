import { rankStandings } from "../standings/rules";
import type { PickDistribution } from "../results/rules";
import type {
  RevealedEntry,
  RevealedGame,
  ResultsWeekOption,
  WeeklyResults,
} from "../results/service";

export type WeeklyRecap = {
  status: "waiting" | "no_entry" | "ready";
  week: ResultsWeekOption;
  completedGames: number;
  gameCount: number;
  player: {
    displayName: string;
    profilePhotoUrl: string | null;
  } | null;
  correctPicks: number;
  incorrectPicks: number;
  tiedPicks: number;
  voidPicks: number;
  gradedPicks: number;
  rank: number | null;
  fieldSize: number;
  playersBehind: number;
  tiedAtRank: boolean;
  winRate: number;
  bestStreak: number;
  tiebreaker: {
    prediction: number;
    actual: number | null;
    difference: number | null;
  } | null;
  boldestHit: {
    teamCode: string;
    teamName: string;
    pickPercent: number;
  } | null;
};

function tiebreakerActual(games: RevealedGame[]): number | null {
  const game = games.find((candidate) => candidate.isMondayTiebreaker);
  if (!game || game.status !== "final" || game.awayScore === null || game.homeScore === null) {
    return null;
  }
  return game.awayScore + game.homeScore;
}

function tiebreakerDifference(entry: RevealedEntry, games: RevealedGame[]): number | null {
  const actual = tiebreakerActual(games);
  return actual === null ? null : Math.abs(entry.mondayPrediction - actual);
}

function longestWinningStreak(entry: RevealedEntry): number {
  let longest = 0;
  let current = 0;
  for (const pick of entry.picks) {
    if (pick.outcome === "won") {
      current += 1;
      longest = Math.max(longest, current);
    } else if (["lost", "tie"].includes(pick.outcome)) {
      current = 0;
    }
  }
  return longest;
}

function selectedPickPercent(
  distribution: PickDistribution,
  teamCode: string,
): number | null {
  if (distribution.totalPicks === 0) return null;
  if (teamCode === distribution.awayTeamCode) return distribution.awayPercent;
  if (teamCode === distribution.homeTeamCode) return distribution.homePercent;
  return null;
}

function boldestCorrectCall(
  entry: RevealedEntry,
  distributions: PickDistribution[],
): WeeklyRecap["boldestHit"] {
  const distributionByGame = new Map(distributions.map((distribution) => [distribution.gameId, distribution]));
  const hits = entry.picks.flatMap((pick) => {
    if (pick.outcome !== "won") return [];
    const distribution = distributionByGame.get(pick.gameId);
    if (!distribution) return [];
    const pickPercent = selectedPickPercent(distribution, pick.selectedTeamCode);
    if (pickPercent === null) return [];
    return [{
      teamCode: pick.selectedTeamCode,
      teamName: pick.selectedTeamName,
      pickPercent,
    }];
  });
  return hits.toSorted((first, second) => first.pickPercent - second.pickPercent)[0] ?? null;
}

function emptyRecap(
  status: "waiting" | "no_entry",
  week: ResultsWeekOption,
  completedGames: number,
  gameCount: number,
  entry: RevealedEntry | null,
  fieldSize: number,
): WeeklyRecap {
  return {
    status,
    week,
    completedGames,
    gameCount,
    player: entry ? {
      displayName: entry.displayName,
      profilePhotoUrl: entry.profilePhotoUrl,
    } : null,
    correctPicks: entry?.correctPicks ?? 0,
    incorrectPicks: entry?.picks.filter((pick) => pick.outcome === "lost").length ?? 0,
    tiedPicks: entry?.picks.filter((pick) => pick.outcome === "tie").length ?? 0,
    voidPicks: entry?.picks.filter((pick) => ["canceled", "postponed"].includes(pick.gameStatus)).length ?? 0,
    gradedPicks: entry?.gradedPicks ?? 0,
    rank: null,
    fieldSize,
    playersBehind: 0,
    tiedAtRank: false,
    winRate: 0,
    bestStreak: 0,
    tiebreaker: entry ? {
      prediction: entry.mondayPrediction,
      actual: null,
      difference: null,
    } : null,
    boldestHit: null,
  };
}

export function buildWeeklyRecap(results: WeeklyResults): WeeklyRecap | null {
  if (results.revealStatus !== "revealed" || !results.selectedWeek) return null;

  const entry = results.entries.find((candidate) => candidate.isCurrentUser) ?? null;
  const completedGames = results.games.filter((game) => ["final", "canceled"].includes(game.status)).length;
  const gameCount = results.games.length;
  const allGamesComplete = gameCount > 0 && completedGames === gameCount;

  if (!entry) {
    return emptyRecap("no_entry", results.selectedWeek, completedGames, gameCount, null, results.entries.length);
  }
  if (!allGamesComplete) {
    return emptyRecap("waiting", results.selectedWeek, completedGames, gameCount, entry, results.entries.length);
  }

  const actual = tiebreakerActual(results.games);
  const ranked = rankStandings(results.entries.map((candidate) => ({
    userId: candidate.userId,
    displayName: candidate.displayName,
    profilePhotoUrl: candidate.profilePhotoUrl,
    correctPicks: candidate.correctPicks,
    gradedPicks: candidate.gradedPicks,
    tiebreakerDiff: tiebreakerDifference(candidate, results.games),
  })));
  const currentStanding = ranked.find((standing) => standing.userId === entry.userId);
  const rank = currentStanding?.rank ?? null;
  const tiedAtRank = rank !== null && ranked.filter((standing) => standing.rank === rank).length > 1;
  const playersBehind = rank === null
    ? 0
    : ranked.filter((standing) => standing.rank > rank).length;
  const incorrectPicks = entry.picks.filter((pick) => pick.outcome === "lost").length;
  const tiedPicks = entry.picks.filter((pick) => pick.outcome === "tie").length;
  const voidPicks = entry.picks.filter((pick) => pick.gameStatus === "canceled").length;

  return {
    status: "ready",
    week: results.selectedWeek,
    completedGames,
    gameCount,
    player: {
      displayName: entry.displayName,
      profilePhotoUrl: entry.profilePhotoUrl,
    },
    correctPicks: entry.correctPicks,
    incorrectPicks,
    tiedPicks,
    voidPicks,
    gradedPicks: entry.gradedPicks,
    rank,
    fieldSize: results.entries.length,
    playersBehind,
    tiedAtRank,
    winRate: entry.gradedPicks > 0 ? Math.round((entry.correctPicks / entry.gradedPicks) * 100) : 0,
    bestStreak: longestWinningStreak(entry),
    tiebreaker: {
      prediction: entry.mondayPrediction,
      actual,
      difference: actual === null ? null : Math.abs(entry.mondayPrediction - actual),
    },
    boldestHit: boldestCorrectCall(entry, results.distributions),
  };
}
