import "server-only";

import { and, eq, gte, inArray, like, lte, notInArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contestWeeks, games } from "@/lib/db/schema";
import { fetchEspnWeekScores } from "./espn";

const SCORE_SYNC_THROTTLE_MS = 50_000;
const SCORE_SYNC_LOOKBACK_MS = 8 * 24 * 60 * 60 * 1_000;
const ODDS_SYNC_LOOKAHEAD_MS = 8 * 24 * 60 * 60 * 1_000;

type PendingGame = {
  id: string;
  providerGameKey: string;
  status: "scheduled" | "in_progress" | "final" | "postponed" | "canceled";
  awayScore: number | null;
  homeScore: number | null;
  awayMoneyline: number | null;
  homeMoneyline: number | null;
  overUnder: number | null;
  oddsProvider: string | null;
  oddsUpdatedAt: Date | null;
  updatedAt: Date;
  season: number;
  seasonPhase: "preseason" | "regular";
  weekNumber: number;
};

export type ScoreSyncSummary = {
  checkedWeeks: number;
  checkedGames: number;
  updatedGames: number;
  errors: string[];
};

function weekKey(game: Pick<PendingGame, "season" | "seasonPhase" | "weekNumber">): string {
  return `${game.season}:${game.seasonPhase}:${game.weekNumber}`;
}

export async function syncRecentEspnScores(now = new Date()): Promise<ScoreSyncSummary> {
  const db = getDb();
  const pendingGames = await db
    .select({
      id: games.id,
      providerGameKey: games.providerGameKey,
      status: games.status,
      awayScore: games.awayScore,
      homeScore: games.homeScore,
      awayMoneyline: games.awayMoneyline,
      homeMoneyline: games.homeMoneyline,
      overUnder: games.overUnder,
      oddsProvider: games.oddsProvider,
      oddsUpdatedAt: games.oddsUpdatedAt,
      updatedAt: games.updatedAt,
      season: contestWeeks.season,
      seasonPhase: contestWeeks.seasonPhase,
      weekNumber: contestWeeks.weekNumber,
    })
    .from(games)
    .innerJoin(contestWeeks, eq(contestWeeks.id, games.contestWeekId))
    .where(and(
      inArray(contestWeeks.status, ["published", "locked", "final"]),
      like(games.providerGameKey, "espn:%"),
      notInArray(games.status, ["final", "canceled"]),
      lte(games.kickoffAt, new Date(now.getTime() + ODDS_SYNC_LOOKAHEAD_MS)),
      gte(games.kickoffAt, new Date(now.getTime() - SCORE_SYNC_LOOKBACK_MS)),
    ));

  const groupedGames = new Map<string, PendingGame[]>();
  for (const game of pendingGames) {
    if (!game.providerGameKey) continue;
    const typedGame = { ...game, providerGameKey: game.providerGameKey } satisfies PendingGame;
    const grouped = groupedGames.get(weekKey(typedGame)) ?? [];
    grouped.push(typedGame);
    groupedGames.set(weekKey(typedGame), grouped);
  }

  const summary: ScoreSyncSummary = {
    checkedWeeks: 0,
    checkedGames: 0,
    updatedGames: 0,
    errors: [],
  };
  const throttleCutoff = now.getTime() - SCORE_SYNC_THROTTLE_MS;

  for (const weekGames of groupedGames.values()) {
    if (weekGames.every((game) => game.updatedAt.getTime() > throttleCutoff)) continue;
    const [week] = weekGames;
    summary.checkedWeeks += 1;
    summary.checkedGames += weekGames.length;

    try {
      const providerResults = await fetchEspnWeekScores({
        season: week.season,
        seasonPhase: week.seasonPhase,
        weekNumber: week.weekNumber,
      });
      const resultByKey = new Map(providerResults.map((result) => [result.providerGameKey, result]));

      await Promise.all(weekGames.map(async (game) => {
        const result = resultByKey.get(game.providerGameKey);
        const hasPostedOdds = Boolean(
          result && (
            result.awayMoneyline !== null ||
            result.homeMoneyline !== null ||
            result.overUnder !== null
          ),
        );
        const nextAwayMoneyline = result?.awayMoneyline ?? game.awayMoneyline;
        const nextHomeMoneyline = result?.homeMoneyline ?? game.homeMoneyline;
        const nextOverUnder = result?.overUnder ?? game.overUnder;
        const nextOddsProvider = result?.oddsProvider ?? game.oddsProvider ?? "ESPN";
        const changed = Boolean(
          result && (
            result.status !== game.status ||
            result.awayScore !== game.awayScore ||
            result.homeScore !== game.homeScore ||
            (hasPostedOdds && (
              nextAwayMoneyline !== game.awayMoneyline ||
              nextHomeMoneyline !== game.homeMoneyline ||
              nextOverUnder !== game.overUnder ||
              nextOddsProvider !== game.oddsProvider
            ))
          ),
        );
        await db
          .update(games)
          .set(result ? {
            status: result.status,
            awayScore: result.awayScore,
            homeScore: result.homeScore,
            ...(hasPostedOdds ? {
              awayMoneyline: nextAwayMoneyline,
              homeMoneyline: nextHomeMoneyline,
              overUnder: nextOverUnder,
              oddsProvider: nextOddsProvider,
              oddsUpdatedAt: now,
            } : {}),
            updatedAt: now,
          } : { updatedAt: now })
          .where(eq(games.id, game.id));
        if (changed) summary.updatedGames += 1;
      }));
    } catch (error) {
      summary.errors.push(error instanceof Error ? error.message : `Score sync failed for ${weekKey(week)}.`);
    }
  }

  return summary;
}
