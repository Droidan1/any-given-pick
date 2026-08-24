export type AchievementCard = {
  id: string;
  season: number;
  seasonPhase: "preseason" | "regular";
  weekNumber: number;
  weekLabel: string;
  versionNumber: number;
  gameCount: number;
  officialPicks: Array<{
    gameStatus: "scheduled" | "in_progress" | "final" | "postponed" | "canceled";
    outcome: "won" | "lost" | "tie" | "pending" | "no_pick";
  }>;
};

export type PlayerAchievement = {
  id: "first_call" | "film_room" | "double_digits" | "hot_route" | "clean_sheet" | "iron_season";
  symbol: string;
  title: string;
  description: string;
  earned: boolean;
  earnedOn: string | null;
  progress: number;
  target: number;
  progressLabel: string;
};

export type PlayerAchievements = {
  achievements: PlayerAchievement[];
  earnedCount: number;
  totalCount: number;
};

function isOfficial(card: AchievementCard): boolean {
  return card.versionNumber > 0;
}

function isSettled(card: AchievementCard): boolean {
  return card.gameCount > 0
    && card.officialPicks.length === card.gameCount
    && card.officialPicks.every((pick) => ["final", "canceled"].includes(pick.gameStatus));
}

function cardOrder(first: AchievementCard, second: AchievementCard): number {
  if (first.season !== second.season) return first.season - second.season;
  if (first.seasonPhase !== second.seasonPhase) return first.seasonPhase === "preseason" ? -1 : 1;
  return first.weekNumber - second.weekNumber;
}

function cardLabel(card: AchievementCard): string {
  return `${card.season} ${card.weekLabel}`;
}

function longestWinStreak(card: AchievementCard): number {
  let current = 0;
  let longest = 0;
  for (const pick of card.officialPicks) {
    if (pick.outcome === "won") {
      current += 1;
      longest = Math.max(longest, current);
    } else if (["lost", "tie", "no_pick"].includes(pick.outcome)) {
      current = 0;
    }
  }
  return longest;
}

function outcomeCount(card: AchievementCard, outcome: "won" | "lost" | "tie"): number {
  return card.officialPicks.filter((pick) => pick.outcome === outcome).length;
}

function progressLabel(current: number, target: number, unit: string): string {
  const value = Math.min(current, target);
  return `${value} of ${target} ${unit}`;
}

export function buildPlayerAchievements(cards: AchievementCard[]): PlayerAchievements {
  const officialCards = cards.filter(isOfficial).toSorted(cardOrder);
  const settledCards = officialCards.filter(isSettled);
  const firstOfficial = officialCards[0] ?? null;
  const thirdSettled = settledCards[2] ?? null;
  const doubleDigits = officialCards.find((card) => outcomeCount(card, "won") >= 10) ?? null;
  const hotRoute = officialCards.find((card) => longestWinStreak(card) >= 5) ?? null;
  const cleanSheet = settledCards.find((card) => {
    const wins = outcomeCount(card, "won");
    const losses = outcomeCount(card, "lost");
    const ties = outcomeCount(card, "tie");
    const gradedPicks = wins + losses + ties;
    return gradedPicks >= 8 && losses === 0 && ties === 0;
  }) ?? null;

  const regularCardsBySeason = new Map<number, AchievementCard[]>();
  for (const card of officialCards.filter((candidate) => (
    candidate.seasonPhase === "regular"
    && candidate.weekNumber >= 1
    && candidate.weekNumber <= 18
  ))) {
    const seasonCards = regularCardsBySeason.get(card.season) ?? [];
    if (!seasonCards.some((candidate) => candidate.weekNumber === card.weekNumber)) {
      seasonCards.push(card);
      regularCardsBySeason.set(card.season, seasonCards);
    }
  }
  const bestRegularSeason = [...regularCardsBySeason.values()]
    .toSorted((first, second) => second.length - first.length)[0] ?? [];
  const requiredRegularWeeks = Array.from({ length: 18 }, (_, index) => index + 1);
  const bestRegularWeekNumbers = new Set(bestRegularSeason.map((card) => card.weekNumber));
  const hasCompleteRegularSeason = requiredRegularWeeks.every((weekNumber) => (
    bestRegularWeekNumbers.has(weekNumber)
  ));
  const ironSeasonCard = hasCompleteRegularSeason
    ? bestRegularSeason.find((card) => card.weekNumber === 18) ?? null
    : null;

  const maxWins = Math.max(0, ...officialCards.map((card) => outcomeCount(card, "won")));
  const maxStreak = Math.max(0, ...officialCards.map(longestWinStreak));
  const cleanProgress = Math.max(0, ...settledCards.map((card) => (
    outcomeCount(card, "lost") === 0 && outcomeCount(card, "tie") === 0
      ? outcomeCount(card, "won")
      : 0
  )));

  const achievements: PlayerAchievement[] = [
    {
      id: "first_call",
      symbol: "1",
      title: "First call",
      description: "Submit your first official weekly card.",
      earned: Boolean(firstOfficial),
      earnedOn: firstOfficial ? cardLabel(firstOfficial) : null,
      progress: officialCards.length,
      target: 1,
      progressLabel: progressLabel(officialCards.length, 1, "official card"),
    },
    {
      id: "film_room",
      symbol: "3",
      title: "Film room regular",
      description: "Finish three weeks with an official card on the board.",
      earned: Boolean(thirdSettled),
      earnedOn: thirdSettled ? cardLabel(thirdSettled) : null,
      progress: settledCards.length,
      target: 3,
      progressLabel: progressLabel(settledCards.length, 3, "finished weeks"),
    },
    {
      id: "double_digits",
      symbol: "10",
      title: "Double digits",
      description: "Call at least 10 winners on one official card.",
      earned: Boolean(doubleDigits),
      earnedOn: doubleDigits ? cardLabel(doubleDigits) : null,
      progress: maxWins,
      target: 10,
      progressLabel: progressLabel(maxWins, 10, "correct calls in one week"),
    },
    {
      id: "hot_route",
      symbol: "5×",
      title: "Hot route",
      description: "String together five correct calls in a row.",
      earned: Boolean(hotRoute),
      earnedOn: hotRoute ? cardLabel(hotRoute) : null,
      progress: maxStreak,
      target: 5,
      progressLabel: progressLabel(maxStreak, 5, "straight correct calls"),
    },
    {
      id: "clean_sheet",
      symbol: "100",
      title: "Clean sheet",
      description: "Finish a card of at least eight graded games without a miss.",
      earned: Boolean(cleanSheet),
      earnedOn: cleanSheet ? cardLabel(cleanSheet) : null,
      progress: cleanProgress,
      target: 8,
      progressLabel: cleanSheet
        ? `${outcomeCount(cleanSheet, "won")} of ${outcomeCount(cleanSheet, "won")} correct`
        : progressLabel(cleanProgress, 8, "clean calls in a finished week"),
    },
    {
      id: "iron_season",
      symbol: "18",
      title: "Iron season",
      description: "Submit an official card for all 18 regular-season weeks.",
      earned: Boolean(ironSeasonCard),
      earnedOn: ironSeasonCard ? `${ironSeasonCard.season} regular season` : null,
      progress: bestRegularSeason.length,
      target: 18,
      progressLabel: progressLabel(bestRegularSeason.length, 18, "regular-season cards"),
    },
  ];

  const earned = achievements.filter((achievement) => achievement.earned);
  return {
    achievements,
    earnedCount: earned.length,
    totalCount: achievements.length,
  };
}
