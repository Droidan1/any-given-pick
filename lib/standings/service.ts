import "server-only";

import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  contestEntries,
  contestWeeks,
  entryVersionPicks,
  entryVersions,
  games,
  profiles,
} from "@/lib/db/schema";
import { rankStandings } from "./rules";
import type { StandingsSnapshot, UnrankedStanding } from "./types";

export async function getSeasonStandings(): Promise<StandingsSnapshot> {
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
        userId: contestEntries.userId,
        displayName: profiles.displayName,
        mondayPrediction: entryVersions.mondayPrediction,
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

  const participants = new Map<string, UnrankedStanding & { hasTiebreaker: boolean }>();
  for (const entry of entryRows) {
    const standing = participants.get(entry.userId) ?? {
      userId: entry.userId,
      displayName: entry.displayName,
      correctPicks: 0,
      gradedPicks: 0,
      tiebreakerDiff: 0,
      hasTiebreaker: false,
    };
    const versionPicks = picksByVersion.get(entry.versionId) ?? [];
    for (const pick of versionPicks) {
      const game = gamesById.get(pick.gameId);
      if (
        !game ||
        game.status !== "final" ||
        game.awayScore === null ||
        game.homeScore === null
      ) continue;

      standing.gradedPicks += 1;
      if (game.awayScore !== game.homeScore) {
        const winner = game.awayScore > game.homeScore
          ? game.awayTeamCode
          : game.homeTeamCode;
        if (pick.selectedTeamCode === winner) standing.correctPicks += 1;
      }

      if (game.isTiebreaker) {
        standing.tiebreakerDiff = (standing.tiebreakerDiff ?? 0)
          + Math.abs(entry.mondayPrediction - (game.awayScore + game.homeScore));
        standing.hasTiebreaker = true;
      }
    }
    participants.set(entry.userId, standing);
  }

  const rows = rankStandings(
    [...participants.values()].map(({ hasTiebreaker, ...standing }) => ({
      ...standing,
      tiebreakerDiff: hasTiebreaker ? standing.tiebreakerDiff : null,
    })),
  );
  const throughWeek = gameRows.reduce<number | null>((latest, game) => {
    if (game.status !== "final") return latest;
    return latest === null ? game.weekNumber : Math.max(latest, game.weekNumber);
  }, null);

  return {
    status: "ready",
    season,
    weekOneFinalGames,
    weekOneGameCount: countableWeekOneGames.length,
    throughWeek,
    rows,
  };
}
