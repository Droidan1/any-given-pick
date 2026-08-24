import type { RevealedEntry, RevealedGame, WeeklyResults } from "@/lib/results/service";

export type LiveRaceGame = RevealedGame & {
  displayStatus: string;
};

export type LiveRacePlayer = {
  userId: string;
  displayName: string;
  profilePhotoUrl: string | null;
  isCurrentUser: boolean;
  rank: number;
  baselineRank: number;
  rankChange: number;
  correct: number;
  incorrect: number;
  live: number;
  pending: number;
  projectedCorrect: number;
  maxCorrect: number;
  mondayPrediction: number;
  tiebreakerDiff: number | null;
  livePickCodes: string[];
  unresolvedPickCodes: string[];
  pathLabel: string;
  pathCopy: string;
};

export type LiveWeekRace = {
  status: "no_week" | "sealed" | "ready";
  week: WeeklyResults["selectedWeek"];
  serverNow: string;
  finalCount: number;
  liveCount: number;
  waitingCount: number;
  gamesToFeature: LiveRaceGame[];
  players: LiveRacePlayer[];
};

type PlayerDraft = Omit<LiveRacePlayer, "rank" | "baselineRank" | "rankChange" | "pathLabel" | "pathCopy"> & {
  picksByGame: Map<string, string>;
};

function projectedWinner(game: RevealedGame): string | null {
  if (game.status !== "in_progress" || game.awayScore === null || game.homeScore === null) return null;
  if (game.awayScore === game.homeScore) return null;
  return game.awayScore > game.homeScore ? game.awayTeamCode : game.homeTeamCode;
}

function scoreTiebreaker(entry: RevealedEntry, games: RevealedGame[]): number | null {
  const game = games.find((candidate) => candidate.isMondayTiebreaker && candidate.status === "final");
  if (!game || game.awayScore === null || game.homeScore === null) return null;
  return Math.abs(entry.mondayPrediction - (game.awayScore + game.homeScore));
}

function gameDisplayStatus(game: RevealedGame): string {
  if (game.status === "in_progress") return "Live";
  if (game.status === "final") return "Final";
  if (game.status === "postponed") return "Postponed";
  if (game.status === "canceled") return "Canceled";
  return "Upcoming";
}

function compareDrafts(
  first: PlayerDraft,
  second: PlayerDraft,
  score: (player: PlayerDraft) => number,
): number {
  const scoreDifference = score(second) - score(first);
  if (scoreDifference !== 0) return scoreDifference;
  const firstDiff = first.tiebreakerDiff ?? Number.POSITIVE_INFINITY;
  const secondDiff = second.tiebreakerDiff ?? Number.POSITIVE_INFINITY;
  if (firstDiff !== secondDiff) return firstDiff - secondDiff;
  return first.displayName.localeCompare(second.displayName);
}

function ranksBy(players: PlayerDraft[], score: (player: PlayerDraft) => number): Map<string, number> {
  const ordered = [...players].sort((first, second) => compareDrafts(first, second, score));
  const ranks = new Map<string, number>();
  ordered.forEach((player, index) => ranks.set(player.userId, index + 1));
  return ranks;
}

function joinCalls(codes: string[]): string {
  if (codes.length === 0) return "no open swing calls";
  if (codes.length === 1) return codes[0];
  if (codes.length === 2) return `${codes[0]} and ${codes[1]}`;
  return `${codes.slice(0, -1).join(", ")}, and ${codes.at(-1)}`;
}

function playerPath(
  player: PlayerDraft,
  rank: number,
  leader: PlayerDraft | undefined,
  allGamesComplete: boolean,
): Pick<LiveRacePlayer, "pathLabel" | "pathCopy"> {
  if (allGamesComplete) {
    return rank === 1
      ? { pathLabel: "Week leader", pathCopy: `${player.displayName} finishes on top with ${player.correct} correct calls.` }
      : { pathLabel: "Week complete", pathCopy: `${player.displayName} finishes No. ${rank} with ${player.correct} correct calls.` };
  }

  if (!leader || player.userId === leader.userId) {
    return {
      pathLabel: player.live > 0 ? "Projected first" : "Sets the pace",
      pathCopy: player.unresolvedPickCodes.length > 0
        ? `${player.displayName} holds the projected lead. Open calls: ${joinCalls(player.unresolvedPickCodes)}.`
        : `${player.displayName} holds the lead while the remaining field settles.`,
    };
  }

  const swingCalls = player.unresolvedPickCodes.filter((code, index) => {
    const gameId = [...player.picksByGame.entries()].find(([, pickCode]) => pickCode === code)?.[0];
    if (!gameId) return false;
    return leader.picksByGame.get(gameId) !== code && player.unresolvedPickCodes.indexOf(code) === index;
  });
  const deficit = Math.max(0, leader.projectedCorrect - player.projectedCorrect);
  if (player.maxCorrect < leader.correct) {
    return {
      pathLabel: "Needs the board to turn",
      pathCopy: `${player.displayName} cannot catch the current final-game pace without live results moving against the leaders.`,
    };
  }
  if (swingCalls.length === 0) {
    return {
      pathLabel: "Tiebreaker pressure",
      pathCopy: `${player.displayName} matches the leader on the remaining calls. The Monday total may decide an equal record.`,
    };
  }
  return {
    pathLabel: `${swingCalls.length} swing ${swingCalls.length === 1 ? "call" : "calls"}`,
    pathCopy: `${player.displayName} is ${deficit || 1} projected ${deficit === 1 ? "call" : "calls"} back. Key differences: ${joinCalls(swingCalls)}.`,
  };
}

export function buildLiveWeekRace(results: WeeklyResults): LiveWeekRace {
  const finalCount = results.games.filter((game) => game.status === "final").length;
  const liveCount = results.games.filter((game) => game.status === "in_progress").length;
  const waitingCount = results.games.filter((game) => ["scheduled", "postponed"].includes(game.status)).length;
  const gamesToFeature = [
    ...results.games.filter((game) => game.status === "in_progress"),
    ...results.games.filter((game) => ["scheduled", "postponed"].includes(game.status)),
    ...results.games.filter((game) => game.status === "final").reverse(),
  ].slice(0, 3).map((game) => ({ ...game, displayStatus: gameDisplayStatus(game) }));

  if (results.revealStatus !== "revealed") {
    return {
      status: results.revealStatus === "open" ? "sealed" : "no_week",
      week: results.selectedWeek,
      serverNow: results.serverNow,
      finalCount,
      liveCount,
      waitingCount,
      gamesToFeature: [],
      players: [],
    };
  }

  const gamesById = new Map(results.games.map((game) => [game.id, game]));
  const drafts: PlayerDraft[] = results.entries.map((entry) => {
    const livePicks = entry.picks.filter((pick) => pick.gameStatus === "in_progress");
    const pendingPicks = entry.picks.filter((pick) => ["scheduled", "postponed"].includes(pick.gameStatus));
    const unresolvedPicks = [...livePicks, ...pendingPicks];
    const projectedLiveWins = livePicks.filter((pick) => {
      const game = gamesById.get(pick.gameId);
      return game ? projectedWinner(game) === pick.selectedTeamCode : false;
    }).length;
    const correct = entry.picks.filter((pick) => pick.outcome === "won").length;
    return {
      userId: entry.userId,
      displayName: entry.displayName,
      profilePhotoUrl: entry.profilePhotoUrl,
      isCurrentUser: entry.isCurrentUser,
      correct,
      incorrect: entry.picks.filter((pick) => pick.outcome === "lost").length,
      live: livePicks.length,
      pending: pendingPicks.length,
      projectedCorrect: correct + projectedLiveWins,
      maxCorrect: correct + unresolvedPicks.length,
      mondayPrediction: entry.mondayPrediction,
      tiebreakerDiff: scoreTiebreaker(entry, results.games),
      livePickCodes: livePicks.map((pick) => pick.selectedTeamCode),
      unresolvedPickCodes: unresolvedPicks.map((pick) => pick.selectedTeamCode),
      picksByGame: new Map(entry.picks.map((pick) => [pick.gameId, pick.selectedTeamCode])),
    };
  });
  const baselineRanks = ranksBy(drafts, (player) => player.correct);
  const projectedRanks = ranksBy(drafts, (player) => player.projectedCorrect);
  const ordered = [...drafts].sort((first, second) => compareDrafts(first, second, (player) => player.projectedCorrect));
  const leader = ordered[0];
  const allGamesComplete = results.games.length > 0 && results.games.every((game) => ["final", "canceled"].includes(game.status));
  const players = ordered.map((player): LiveRacePlayer => {
    const rank = projectedRanks.get(player.userId) ?? 1;
    const baselineRank = baselineRanks.get(player.userId) ?? rank;
    const path = playerPath(player, rank, leader, allGamesComplete);
    return {
      userId: player.userId,
      displayName: player.displayName,
      profilePhotoUrl: player.profilePhotoUrl,
      isCurrentUser: player.isCurrentUser,
      correct: player.correct,
      incorrect: player.incorrect,
      live: player.live,
      pending: player.pending,
      projectedCorrect: player.projectedCorrect,
      maxCorrect: player.maxCorrect,
      mondayPrediction: player.mondayPrediction,
      tiebreakerDiff: player.tiebreakerDiff,
      livePickCodes: player.livePickCodes,
      unresolvedPickCodes: player.unresolvedPickCodes,
      rank,
      baselineRank,
      rankChange: baselineRank - rank,
      ...path,
    };
  });

  return {
    status: "ready",
    week: results.selectedWeek,
    serverNow: results.serverNow,
    finalCount,
    liveCount,
    waitingCount,
    gamesToFeature,
    players,
  };
}
