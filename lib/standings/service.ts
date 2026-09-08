import "server-only";

import { and, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { getDb } from "@/lib/db";
import {
  contestEntries,
  contestWeeks,
  entryVersionPicks,
  entryVersions,
  games,
  profiles,
} from "@/lib/db/schema";
import { bestBoardsPerWeek } from "@/lib/entries/board-rules";
import { addRankChanges, rankStandings } from "./rules";
import type { StandingsSnapshot, UnrankedStanding } from "./types";

export const STANDINGS_CACHE_TAG = "season-standings";

async function computeSeasonStandings(): Promise<StandingsSnapshot> {
  const db = getDb();
  const [latestWeek] = await db
    .select({ season: contestWeeks.season })
    .from(contestWeeks)
    .orderBy(desc(contestWeeks.season))
    .limit(1);
  const season = latestWeek?.season ?? new Date().getFullYear();

  const [weekOne] = await db
    .select({ id: contestWeeks.id })
    .from(contestWeeks)
    .where(and(
      eq(contestWeeks.season, season),
      eq(contestWeeks.seasonPhase, "regular"),
      eq(contestWeeks.weekNumber, 1),
    ))
    .limit(1);

  const weekOneGames = weekOne
    ? await db
        .select({ status: games.status })
        .from(games)
        .where(eq(games.contestWeekId, weekOne.id))
    : [];
  const countableWeekOneGames = weekOneGames.filter((game) => game.status !== "canceled");
  const weekOneFinalGames = countableWeekOneGames.filter((game) => game.status === "final").length;
  const weekOneIsFinal = countableWeekOneGames.length > 0
    && weekOneFinalGames === countableWeekOneGames.length;

  if (!weekOneIsFinal) {
    return {
      status: "waiting",
      season,
      weekOneFinalGames,
      weekOneGameCount: countableWeekOneGames.length,
      throughWeek: null,
      rows: [],
    };
  }

  const [gameRows, entryRows] = await Promise.all([
    db
      .select({
        id: games.id,
        weekNumber: contestWeeks.weekNumber,
        status: games.status,
        awayTeamCode: games.awayTeamCode,
        homeTeamCode: games.homeTeamCode,
        awayScore: games.awayScore,
        homeScore: games.homeScore,
        isTiebreaker: games.isMondayTiebreaker,
      })
      .from(games)
      .innerJoin(contestWeeks, eq(contestWeeks.id, games.contestWeekId))
      .where(and(
        eq(contestWeeks.season, season),
        eq(contestWeeks.seasonPhase, "regular"),
      )),
    db
      .select({
        versionId: entryVersions.id,
        weekId: contestEntries.contestWeekId,
        boardNumber: contestEntries.boardNumber,
        userId: contestEntries.userId,
        displayName: profiles.displayName,
        profilePhotoUrl: profiles.profilePhotoUrl,
        mondayPrediction: entryVersions.mondayPrediction,
        weekNumber: contestWeeks.weekNumber,
      })
      .from(contestEntries)
      .innerJoin(contestWeeks, eq(contestWeeks.id, contestEntries.contestWeekId))
      .innerJoin(profiles, eq(profiles.userId, contestEntries.userId))
      .innerJoin(
        entryVersions,
        and(
          eq(entryVersions.contestEntryId, contestEntries.id),
          eq(entryVersions.versionNumber, contestEntries.currentVersionNumber),
        ),
      )
      .where(and(
        eq(contestWeeks.season, season),
        eq(contestWeeks.seasonPhase, "regular"),
        gt(contestEntries.currentVersionNumber, 0),
        ne(contestEntries.status, "disqualified"),
        isNull(contestEntries.archivedAt),
      )),
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

  const throughWeek = gameRows.reduce<number | null>((latest, game) => {
    if (game.status !== "final") return latest;
    return latest === null ? game.weekNumber : Math.max(latest, game.weekNumber);
  }, null);
  type StandingAccumulator = UnrankedStanding & { hasTiebreaker: boolean };
  const participants = new Map<string, StandingAccumulator>();
  const priorParticipants = new Map<string, StandingAccumulator>();

  const newStanding = (entry: typeof entryRows[number]): StandingAccumulator => ({
    userId: entry.userId,
    displayName: entry.displayName,
    profilePhotoUrl: entry.profilePhotoUrl,
    correctPicks: 0,
    gradedPicks: 0,
    tiebreakerDiff: 0,
    hasTiebreaker: false,
  });

  const applyFinalPick = (
    standing: StandingAccumulator,
    entry: typeof entryRows[number],
    game: typeof gameRows[number],
    selectedTeamCode: string,
  ) => {
    standing.gradedPicks += 1;
    if (game.awayScore !== game.homeScore) {
      const winner = (game.awayScore ?? 0) > (game.homeScore ?? 0)
        ? game.awayTeamCode
        : game.homeTeamCode;
      if (selectedTeamCode === winner) standing.correctPicks += 1;
    }
    if (game.isTiebreaker) {
      standing.tiebreakerDiff = (standing.tiebreakerDiff ?? 0)
        + Math.abs(entry.mondayPrediction - ((game.awayScore ?? 0) + (game.homeScore ?? 0)));
      standing.hasTiebreaker = true;
    }
  };

  const scoredBoards = entryRows.map(entry => {
    const standing = newStanding(entry);
    for (const pick of picksByVersion.get(entry.versionId) ?? []) {
      const game = gamesById.get(pick.gameId);
      if (!game || game.status !== "final" || game.awayScore === null || game.homeScore === null) continue;
      applyFinalPick(standing, entry, game, pick.selectedTeamCode);
    }
    return { ...standing, weekId: entry.weekId, weekNumber: entry.weekNumber, boardNumber: entry.boardNumber,
      tiebreakerDiff: standing.hasTiebreaker ? standing.tiebreakerDiff : null };
  });
  for (const board of bestBoardsPerWeek(scoredBoards)) {
    const addBoard = (target: Map<string, StandingAccumulator>) => {
      const standing = target.get(board.userId) ?? { ...board, correctPicks: 0, gradedPicks: 0, tiebreakerDiff: 0, hasTiebreaker: false };
      standing.correctPicks += board.correctPicks;
      standing.gradedPicks += board.gradedPicks;
      if (board.tiebreakerDiff !== null) {
        standing.tiebreakerDiff = (standing.tiebreakerDiff ?? 0) + board.tiebreakerDiff;
        standing.hasTiebreaker = true;
      }
      target.set(board.userId, standing);
    };
    addBoard(participants);
    if (throughWeek !== null && board.weekNumber < throughWeek && board.gradedPicks > 0) addBoard(priorParticipants);
  }

  const rankedRows = rankStandings(
    [...participants.values()].map(({ hasTiebreaker, ...standing }) => ({
      ...standing,
      tiebreakerDiff: hasTiebreaker ? standing.tiebreakerDiff : null,
    })),
  );
  const previousRows = rankStandings(
    [...priorParticipants.values()].map(({ hasTiebreaker, ...standing }) => ({
      ...standing,
      tiebreakerDiff: hasTiebreaker ? standing.tiebreakerDiff : null,
    })),
  );
  const rows = throughWeek !== null && throughWeek > 1
    ? addRankChanges(rankedRows, previousRows)
    : rankedRows;

  return {
    status: "ready",
    season,
    weekOneFinalGames,
    weekOneGameCount: countableWeekOneGames.length,
    throughWeek,
    rows,
  };
}

const getCachedSeasonStandings = unstable_cache(
  computeSeasonStandings,
  [STANDINGS_CACHE_TAG],
  { revalidate: 300, tags: [STANDINGS_CACHE_TAG] },
);

export async function getSeasonStandings(): Promise<StandingsSnapshot> {
  return getCachedSeasonStandings();
}
