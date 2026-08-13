import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { formatWeekName } from "@/lib/admin/schedule-import";
import { getDb } from "@/lib/db";
import { contestEntries, contestWeeks, games } from "@/lib/db/schema";
import type { PlayerWeek } from "./types";

const BUSINESS_TIME_ZONE = "America/Indiana/Indianapolis";

function formatKickoff(kickoffAt: Date): { day: string; time: string } {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "short",
  }).format(kickoffAt);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(kickoffAt);
  return { day, time };
}

function formatDeadline(deadline: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(deadline);
}

export async function getCurrentPlayerWeek(userId: string): Promise<PlayerWeek | null> {
  const db = getDb();
  const [week] = await db
    .select()
    .from(contestWeeks)
    .where(eq(contestWeeks.status, "published"))
    .orderBy(
      desc(contestWeeks.season),
      desc(sql<number>`case when ${contestWeeks.seasonPhase} = 'regular' then 1 else 0 end`),
      desc(contestWeeks.weekNumber),
    )
    .limit(1);

  if (!week) return null;

  const [gameRows, entryRows] = await Promise.all([
    db
      .select()
      .from(games)
      .where(eq(games.contestWeekId, week.id))
      .orderBy(asc(games.sortOrder), asc(games.kickoffAt)),
    db
      .select()
      .from(contestEntries)
      .where(
        and(
          eq(contestEntries.contestWeekId, week.id),
          eq(contestEntries.userId, userId),
        ),
      )
      .limit(1),
  ]);

  const entry = entryRows[0] ?? null;
  const now = new Date();

  return {
    id: week.id,
    season: week.season,
    seasonPhase: week.seasonPhase,
    weekNumber: week.weekNumber,
    label: week.label || formatWeekName(week.seasonPhase, week.weekNumber),
    entryDeadline: week.entryDeadline.toISOString(),
    deadlineLabel: formatDeadline(week.entryDeadline),
    isLocked: now >= week.entryDeadline,
    games: gameRows.map((game) => ({
      id: game.id,
      kickoffAt: game.kickoffAt.toISOString(),
      ...formatKickoff(game.kickoffAt),
      away: { abbreviation: game.awayTeamCode, name: game.awayTeamName },
      home: { abbreviation: game.homeTeamCode, name: game.homeTeamName },
      isMondayTiebreaker: game.isMondayTiebreaker,
      odds: game.oddsProvider && game.oddsUpdatedAt
        ? {
            awayMoneyline: game.awayMoneyline,
            homeMoneyline: game.homeMoneyline,
            overUnder: game.overUnder,
            provider: game.oddsProvider,
            updatedAt: game.oddsUpdatedAt.toISOString(),
          }
        : null,
    })),
    entry: entry
      ? {
          id: entry.id,
          status: entry.status,
          draftPicks: entry.draftPicks,
          mondayPrediction: entry.draftMondayPrediction,
          currentVersionNumber: entry.currentVersionNumber,
          submittedAt: entry.submittedAt?.toISOString() ?? null,
          updatedAt: entry.updatedAt.toISOString(),
        }
      : null,
  };
}
