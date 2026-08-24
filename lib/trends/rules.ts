import type { WeeklyResults } from "@/lib/results/service";

export type TrendStrength = "no_calls" | "even" | "close" | "lean" | "strong";

export type PickTrend = {
  gameId: string;
  awayTeamCode: string;
  homeTeamCode: string;
  awayCount: number;
  homeCount: number;
  totalPicks: number;
  awayPercent: number;
  homePercent: number;
  leaderCode: string | null;
  leaderPercent: number;
  margin: number;
  strength: TrendStrength;
  strengthLabel: string;
  currentUserPick: string | null;
};

export type PickTrendsSnapshot = {
  status: "no_week" | "sealed" | "ready";
  totalCards: number;
  strongConsensusCount: number;
  closeCallCount: number;
  trends: PickTrend[];
};

function classifyTrend(input: {
  totalPicks: number;
  awayPercent: number;
  homePercent: number;
}): Pick<PickTrend, "leaderPercent" | "margin" | "strength" | "strengthLabel"> {
  if (input.totalPicks === 0) {
    return {
      leaderPercent: 0,
      margin: 0,
      strength: "no_calls",
      strengthLabel: "No official calls",
    };
  }

  const leaderPercent = Math.max(input.awayPercent, input.homePercent);
  const margin = Math.abs(input.awayPercent - input.homePercent);
  if (margin === 0) {
    return {
      leaderPercent,
      margin,
      strength: "even",
      strengthLabel: "Even split",
    };
  }
  if (margin <= 10) {
    return {
      leaderPercent,
      margin,
      strength: "close",
      strengthLabel: "Close call",
    };
  }
  if (leaderPercent >= 70) {
    return {
      leaderPercent,
      margin,
      strength: "strong",
      strengthLabel: "Strong consensus",
    };
  }
  return {
    leaderPercent,
    margin,
    strength: "lean",
    strengthLabel: "Field lean",
  };
}

export function buildPickTrends(results: WeeklyResults): PickTrendsSnapshot {
  if (results.revealStatus === "no_week") {
    return { status: "no_week", totalCards: 0, strongConsensusCount: 0, closeCallCount: 0, trends: [] };
  }
  if (results.revealStatus === "open") {
    return { status: "sealed", totalCards: 0, strongConsensusCount: 0, closeCallCount: 0, trends: [] };
  }

  const distributions = new Map(results.distributions.map((distribution) => [distribution.gameId, distribution]));
  const currentEntry = results.entries.find((entry) => entry.isCurrentUser);
  const currentPicks = new Map(currentEntry?.picks.map((pick) => [pick.gameId, pick.selectedTeamCode]) ?? []);

  const trends = results.games.map((game): PickTrend => {
    const distribution = distributions.get(game.id) ?? {
      gameId: game.id,
      awayTeamCode: game.awayTeamCode,
      homeTeamCode: game.homeTeamCode,
      awayCount: 0,
      homeCount: 0,
      totalPicks: 0,
      awayPercent: 0,
      homePercent: 0,
    };
    const classification = classifyTrend(distribution);
    const leaderCode = distribution.totalPicks === 0 || distribution.awayPercent === distribution.homePercent
      ? null
      : distribution.awayPercent > distribution.homePercent
        ? game.awayTeamCode
        : game.homeTeamCode;

    return {
      ...distribution,
      ...classification,
      leaderCode,
      currentUserPick: currentPicks.get(game.id) ?? null,
    };
  });

  return {
    status: "ready",
    totalCards: results.entries.length,
    strongConsensusCount: trends.filter((trend) => trend.strength === "strong").length,
    closeCallCount: trends.filter((trend) => trend.strength === "close" || trend.strength === "even").length,
    trends,
  };
}
