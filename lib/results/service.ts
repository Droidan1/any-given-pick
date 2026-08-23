import "server-only";

import { and, asc, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { formatWeekName } from "@/lib/admin/schedule-import";
import { getDb } from "@/lib/db";
import {
  contestEntries,
  contestWeeks,
  entryVersionPicks,
  entryVersions,
  games,
  profiles,
} from "@/lib/db/schema";
import { calculatePickOutcome, type PickOutcome } from "@/lib/entries/pick-outcome";
import { buildPickDistributions, canRevealWeeklyPicks, type PickDistribution } from "./rules";

export type ResultsWeekOption = {
  id: string;
  season: number;
  seasonPhase: "preseason" | "regular";
  weekNumber: number;
  label: string;
  entryDeadline: string;
};

export type RevealedPick = {
  gameId: string;
  kickoffAt: string;
  awayTeamCode: string;
  awayTeamName: string;
  homeTeamCode: string;
  homeTeamName: string;
  awayScore: number | null;
  homeScore: number | null;
  gameStatus: "scheduled" | "in_progress" | "final" | "postponed" | "canceled";
  selectedTeamCode: string;
  selectedTeamName: string;
  outcome: PickOutcome;
};

export type RevealedEntry = {
  userId: string;
  displayName: string;
  profilePhotoUrl: string | null;
  isCurrentUser: boolean;
  versionNumber: number;
  committedAt: string;
  mondayPrediction: number;
  correctPicks: number;
  gradedPicks: number;
  picks: RevealedPick[];
};

export type WeeklyResults = {
  weeks: ResultsWeekOption[];
  selectedWeek: ResultsWeekOption | null;
  revealStatus: "no_week" | "open" | "revealed";
  serverNow: string;
  entries: RevealedEntry[];
  distributions: PickDistribution[];
};

export async function getWeeklyResults(input: {
  weekId?: string;
  currentUserId: string;
  now?: Date;
}): Promise<WeeklyResults> {
  const db = getDb();
  const serverNow = input.now ?? new Date();
  const weekRows = await db
    .select({
      id: contestWeeks.id,
      season: contestWeeks.season,
      seasonPhase: contestWeeks.seasonPhase,
      weekNumber: contestWeeks.weekNumber,
      label: contestWeeks.label,
      entryDeadline: contestWeeks.entryDeadline,
    })
    .from(contestWeeks)
    .where(inArray(contestWeeks.status, ["published", "locked", "final"]))
    .orderBy(
      desc(contestWeeks.season),
      desc(sql<number>`case when ${contestWeeks.seasonPhase} = 'regular' then 1 else 0 end`),
      desc(contestWeeks.weekNumber),
    )
    .limit(24);

  const weeks = weekRows.map((week): ResultsWeekOption => ({
    id: week.id,
    season: week.season,
    seasonPhase: week.seasonPhase,
    weekNumber: week.weekNumber,
    label: week.label || formatWeekName(week.seasonPhase, week.weekNumber),
    entryDeadline: week.entryDeadline.toISOString(),
  }));
  const pastWeeks = weeks
    .filter((week) => new Date(week.entryDeadline) <= serverNow)
    .sort((first, second) => (
      new Date(second.entryDeadline).getTime() - new Date(first.entryDeadline).getTime()
    ));
  const upcomingWeeks = weeks
    .filter((week) => new Date(week.entryDeadline) > serverNow)
    .sort((first, second) => (
      new Date(first.entryDeadline).getTime() - new Date(second.entryDeadline).getTime()
    ));
  const selectedWeek = weeks.find((week) => week.id === input.weekId)
    ?? pastWeeks[0]
    ?? upcomingWeeks[0]
    ?? null;

  if (!selectedWeek) {
    return {
      weeks,
      selectedWeek: null,
      revealStatus: "no_week",
      serverNow: serverNow.toISOString(),
      entries: [],
      distributions: [],
    };
  }

  if (!canRevealWeeklyPicks(new Date(selectedWeek.entryDeadline), serverNow)) {
    return {
      weeks,
      selectedWeek,
      revealStatus: "open",
      serverNow: serverNow.toISOString(),
      entries: [],
      distributions: [],
    };
  }

  const [gameRows, entryRows] = await Promise.all([
    db
      .select()
      .from(games)
      .where(eq(games.contestWeekId, selectedWeek.id))
      .orderBy(asc(games.sortOrder), asc(games.kickoffAt)),
    db
      .select({
        versionId: entryVersions.id,
        userId: contestEntries.userId,
        displayName: profiles.displayName,
        profilePhotoUrl: profiles.profilePhotoUrl,
        versionNumber: entryVersions.versionNumber,
        mondayPrediction: entryVersions.mondayPrediction,
        committedAt: entryVersions.committedAt,
      })
      .from(contestEntries)
      .innerJoin(profiles, eq(profiles.userId, contestEntries.userId))
      .innerJoin(
        entryVersions,
        and(
          eq(entryVersions.contestEntryId, contestEntries.id),
          eq(entryVersions.versionNumber, contestEntries.currentVersionNumber),
        ),
      )
      .where(and(
        eq(contestEntries.contestWeekId, selectedWeek.id),
        gt(contestEntries.currentVersionNumber, 0),
        ne(contestEntries.status, "disqualified"),
      ))
      .orderBy(asc(profiles.normalizedDisplayName)),
  ]);

  const versionIds = entryRows.map((entry) => entry.versionId);
  const pickRows = versionIds.length > 0
    ? await db
        .select({
          versionId: entryVersionPicks.entryVersionId,
          gameId: entryVersionPicks.gameId,
          selectedTeamCode: entryVersionPicks.selectedTeamCode,
        })
        .from(entryVersionPicks)
        .where(inArray(entryVersionPicks.entryVersionId, versionIds))
    : [];
  const gamesById = new Map(gameRows.map((game) => [game.id, game]));
  const picksByVersion = new Map<string, typeof pickRows>();
  for (const pick of pickRows) {
    const versionPicks = picksByVersion.get(pick.versionId) ?? [];
    versionPicks.push(pick);
    picksByVersion.set(pick.versionId, versionPicks);
  }

  const entries = entryRows.map((entry): RevealedEntry => {
    const entryPicks = picksByVersion.get(entry.versionId) ?? [];
    const picks = entryPicks.flatMap((pick): RevealedPick[] => {
      const game = gamesById.get(pick.gameId);
      if (!game) return [];
      const selectedTeamName = pick.selectedTeamCode === game.awayTeamCode
        ? game.awayTeamName
        : game.homeTeamName;
      return [{
        gameId: game.id,
        kickoffAt: game.kickoffAt.toISOString(),
        awayTeamCode: game.awayTeamCode,
        awayTeamName: game.awayTeamName,
        homeTeamCode: game.homeTeamCode,
        homeTeamName: game.homeTeamName,
        awayScore: game.awayScore,
        homeScore: game.homeScore,
        gameStatus: game.status,
        selectedTeamCode: pick.selectedTeamCode,
        selectedTeamName,
        outcome: calculatePickOutcome({
          gameStatus: game.status,
          awayScore: game.awayScore,
          homeScore: game.homeScore,
          awayTeamCode: game.awayTeamCode,
          homeTeamCode: game.homeTeamCode,
          selectedTeamCode: pick.selectedTeamCode,
        }),
      }];
    }).sort((first, second) => {
      const firstGame = gamesById.get(first.gameId);
      const secondGame = gamesById.get(second.gameId);
      return (firstGame?.sortOrder ?? 0) - (secondGame?.sortOrder ?? 0);
    });
    return {
      userId: entry.userId,
      displayName: entry.displayName,
      profilePhotoUrl: entry.profilePhotoUrl,
      isCurrentUser: entry.userId === input.currentUserId,
      versionNumber: entry.versionNumber,
      committedAt: entry.committedAt.toISOString(),
      mondayPrediction: entry.mondayPrediction,
      correctPicks: picks.filter((pick) => pick.outcome === "won").length,
      gradedPicks: picks.filter((pick) => ["won", "lost", "tie"].includes(pick.outcome)).length,
      picks,
    };
  }).sort((first, second) => {
    if (first.isCurrentUser !== second.isCurrentUser) return first.isCurrentUser ? -1 : 1;
    return first.displayName.localeCompare(second.displayName);
  });

  return {
    weeks,
    selectedWeek,
    revealStatus: "revealed",
    serverNow: serverNow.toISOString(),
    entries,
    distributions: buildPickDistributions(gameRows, pickRows),
  };
}
