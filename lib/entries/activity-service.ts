import "server-only";

import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { formatWeekName } from "@/lib/admin/schedule-import";
import { getDb } from "@/lib/db";
import {
  contestEntries,
  contestWeeks,
  entryVersionPicks,
  entryVersions,
  games,
} from "@/lib/db/schema";
import { draftPayloadSignature, sanitizeDraftPicks } from "./rules";
import { getCurrentPlayerWeek } from "./service";
import { calculatePickOutcome, type PickOutcome } from "./pick-outcome";

export type ActivityPick = {
  gameId: string;
  kickoffAt: string;
  awayTeamCode: string;
  awayTeamName: string;
  homeTeamCode: string;
  homeTeamName: string;
  selectedTeamCode: string | null;
  selectedTeamName: string | null;
  gameStatus: "scheduled" | "in_progress" | "final" | "postponed" | "canceled";
  awayScore: number | null;
  homeScore: number | null;
  outcome: PickOutcome;
};

export type ActivityCard = {
  id: string;
  weekId: string;
  season: number;
  seasonPhase: "preseason" | "regular";
  weekNumber: number;
  weekLabel: string;
  isCurrent: boolean;
  state: "draft" | "pending_edits" | "official" | "not_submitted";
  stateLabel: string;
  versionNumber: number;
  pickCount: number;
  gameCount: number;
  mondayPrediction: number | null;
  committedAt: string | null;
  updatedAt: string | null;
  completedGameCount: number;
  winCount: number;
  lossCount: number;
  tieCount: number;
  picks: ActivityPick[];
};

export type PlayerActivity = {
  cards: ActivityCard[];
  currentCard: ActivityCard | null;
  pastCards: ActivityCard[];
  officialCardCount: number;
  draftCardCount: number;
};

type EntryRow = {
  entryId: string;
  weekId: string;
  season: number;
  seasonPhase: "preseason" | "regular";
  weekNumber: number;
  weekLabel: string | null;
  draftPicks: Record<string, string>;
  draftMondayPrediction: number | null;
  currentVersionNumber: number;
  updatedAt: Date | null;
};

type GameRow = typeof games.$inferSelect;

function rulesForGames(gameRows: GameRow[]) {
  return gameRows.map((game) => ({
    id: game.id,
    awayTeamCode: game.awayTeamCode,
    homeTeamCode: game.homeTeamCode,
  }));
}

function picksMatch(
  gameRows: GameRow[],
  firstPicks: Record<string, string>,
  firstMondayPrediction: number | null,
  secondPicks: Record<string, string>,
  secondMondayPrediction: number | null,
) {
  const gameRules = rulesForGames(gameRows);
  return (
    draftPayloadSignature({
      games: gameRules,
      picks: firstPicks,
      mondayPrediction: firstMondayPrediction,
    }) ===
    draftPayloadSignature({
      games: gameRules,
      picks: secondPicks,
      mondayPrediction: secondMondayPrediction,
    })
  );
}

export async function getPlayerActivity(userId: string): Promise<PlayerActivity> {
  const db = getDb();
  const [currentWeek, entryRows] = await Promise.all([
    getCurrentPlayerWeek(userId),
    db
      .select({
        entryId: contestEntries.id,
        weekId: contestWeeks.id,
        season: contestWeeks.season,
        seasonPhase: contestWeeks.seasonPhase,
        weekNumber: contestWeeks.weekNumber,
        weekLabel: contestWeeks.label,
        draftPicks: contestEntries.draftPicks,
        draftMondayPrediction: contestEntries.draftMondayPrediction,
        currentVersionNumber: contestEntries.currentVersionNumber,
        updatedAt: contestEntries.updatedAt,
      })
      .from(contestEntries)
      .innerJoin(contestWeeks, eq(contestWeeks.id, contestEntries.contestWeekId))
      .where(eq(contestEntries.userId, userId))
      .orderBy(
        desc(contestWeeks.season),
        desc(sql<number>`case when ${contestWeeks.seasonPhase} = 'regular' then 1 else 0 end`),
        desc(contestWeeks.weekNumber),
      ),
  ]);

  const rows: EntryRow[] = [...entryRows];
  if (currentWeek && !rows.some((row) => row.weekId === currentWeek.id)) {
    rows.unshift({
      entryId: `current-${currentWeek.id}`,
      weekId: currentWeek.id,
      season: currentWeek.season,
      seasonPhase: currentWeek.seasonPhase,
      weekNumber: currentWeek.weekNumber,
      weekLabel: currentWeek.label,
      draftPicks: {},
      draftMondayPrediction: null,
      currentVersionNumber: 0,
      updatedAt: null,
    });
  }

  if (rows.length === 0) {
    return {
      cards: [],
      currentCard: null,
      pastCards: [],
      officialCardCount: 0,
      draftCardCount: 0,
    };
  }

  const entryIds = entryRows.map((row) => row.entryId);
  const weekIds = [...new Set(rows.map((row) => row.weekId))];
  const [gameRows, versionRows] = await Promise.all([
    db
      .select()
      .from(games)
      .where(inArray(games.contestWeekId, weekIds))
      .orderBy(asc(games.sortOrder), asc(games.kickoffAt)),
    entryIds.length > 0
      ? db
          .select({
            id: entryVersions.id,
            entryId: entryVersions.contestEntryId,
            versionNumber: entryVersions.versionNumber,
            mondayPrediction: entryVersions.mondayPrediction,
            committedAt: entryVersions.committedAt,
          })
          .from(entryVersions)
          .where(inArray(entryVersions.contestEntryId, entryIds))
          .orderBy(desc(entryVersions.versionNumber))
      : Promise.resolve([]),
  ]);

  const latestVersionByEntry = new Map<string, (typeof versionRows)[number]>();
  for (const version of versionRows) {
    if (!latestVersionByEntry.has(version.entryId)) {
      latestVersionByEntry.set(version.entryId, version);
    }
  }

  const latestVersionIds = [...latestVersionByEntry.values()].map((version) => version.id);
  const versionPickRows = latestVersionIds.length > 0
    ? await db
        .select({
          entryVersionId: entryVersionPicks.entryVersionId,
          gameId: entryVersionPicks.gameId,
          selectedTeamCode: entryVersionPicks.selectedTeamCode,
        })
        .from(entryVersionPicks)
        .where(inArray(entryVersionPicks.entryVersionId, latestVersionIds))
    : [];

  const gamesByWeek = new Map<string, GameRow[]>();
  for (const game of gameRows) {
    const weekGames = gamesByWeek.get(game.contestWeekId) ?? [];
    weekGames.push(game);
    gamesByWeek.set(game.contestWeekId, weekGames);
  }

  const officialPicksByVersion = new Map<string, Record<string, string>>();
  for (const pick of versionPickRows) {
    const versionPicks = officialPicksByVersion.get(pick.entryVersionId) ?? {};
    versionPicks[pick.gameId] = pick.selectedTeamCode;
    officialPicksByVersion.set(pick.entryVersionId, versionPicks);
  }

  const cards = rows.map((row): ActivityCard => {
    const weekGames = gamesByWeek.get(row.weekId) ?? [];
    const gameRules = rulesForGames(weekGames);
    const isCurrent = currentWeek?.id === row.weekId;
    const latestVersion = latestVersionByEntry.get(row.entryId) ?? null;
    const officialPicks = latestVersion
      ? officialPicksByVersion.get(latestVersion.id) ?? {}
      : {};
    const draftPicks = sanitizeDraftPicks(gameRules, row.draftPicks);
    const hasPendingEdits = Boolean(
      isCurrent &&
      latestVersion &&
      !picksMatch(
        weekGames,
        draftPicks,
        row.draftMondayPrediction,
        officialPicks,
        latestVersion.mondayPrediction,
      ),
    );
    const displayedPicks = isCurrent || !latestVersion ? draftPicks : officialPicks;
    const mondayPrediction = isCurrent || !latestVersion
      ? row.draftMondayPrediction
      : latestVersion.mondayPrediction;

    let state: ActivityCard["state"];
    let stateLabel: string;
    if (hasPendingEdits) {
      state = "pending_edits";
      stateLabel = "Edits not submitted";
    } else if (latestVersion) {
      state = "official";
      stateLabel = `Official version ${latestVersion.versionNumber}`;
    } else if (isCurrent) {
      state = "draft";
      stateLabel = "Current draft";
    } else {
      state = "not_submitted";
      stateLabel = "Not submitted";
    }

    const picks = weekGames.map((game): ActivityPick => {
      const selectedTeamCode = displayedPicks[game.id] ?? null;
      const selectedTeamName = selectedTeamCode === game.awayTeamCode
        ? game.awayTeamName
        : selectedTeamCode === game.homeTeamCode
          ? game.homeTeamName
          : null;
      return {
        gameId: game.id,
        kickoffAt: game.kickoffAt.toISOString(),
        awayTeamCode: game.awayTeamCode,
        awayTeamName: game.awayTeamName,
        homeTeamCode: game.homeTeamCode,
        homeTeamName: game.homeTeamName,
        selectedTeamCode,
        selectedTeamName,
        gameStatus: game.status,
        awayScore: game.awayScore,
        homeScore: game.homeScore,
        outcome: calculatePickOutcome({
          gameStatus: game.status,
          awayScore: game.awayScore,
          homeScore: game.homeScore,
          awayTeamCode: game.awayTeamCode,
          homeTeamCode: game.homeTeamCode,
          selectedTeamCode,
        }),
      };
    });

    return {
      id: row.entryId,
      weekId: row.weekId,
      season: row.season,
      seasonPhase: row.seasonPhase,
      weekNumber: row.weekNumber,
      weekLabel: row.weekLabel || formatWeekName(row.seasonPhase, row.weekNumber),
      isCurrent,
      state,
      stateLabel,
      versionNumber: latestVersion?.versionNumber ?? 0,
      pickCount: Object.keys(displayedPicks).length,
      gameCount: weekGames.length,
      mondayPrediction,
      committedAt: latestVersion?.committedAt.toISOString() ?? null,
      updatedAt: row.updatedAt?.toISOString() ?? null,
      completedGameCount: picks.filter((pick) => pick.gameStatus === "final").length,
      winCount: picks.filter((pick) => pick.outcome === "won").length,
      lossCount: picks.filter((pick) => pick.outcome === "lost").length,
      tieCount: picks.filter((pick) => pick.outcome === "tie").length,
      picks,
    };
  });

  const currentCard = cards.find((card) => card.isCurrent) ?? null;
  const pastCards = cards.filter((card) => !card.isCurrent);

  return {
    cards,
    currentCard,
    pastCards,
    officialCardCount: cards.filter((card) => card.versionNumber > 0).length,
    draftCardCount: cards.filter((card) => card.versionNumber === 0).length,
  };
}
