import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { formatWeekName } from "@/lib/admin/schedule-import";
import { getDb } from "@/lib/db";
import { contestEntries, contestWeeks, games, profiles, users } from "@/lib/db/schema";
import type { LivePlayerPicks, PlayerWeek } from "./types";

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

async function loadLivePlayerPicks(weekId: string): Promise<LivePlayerPicks[]> {
  const rows = await getDb()
    .select({
      userId: users.id,
      displayName: profiles.displayName,
      picks: contestEntries.draftPicks,
      updatedAt: contestEntries.updatedAt,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(
      contestEntries,
      and(
        eq(contestEntries.userId, users.id),
        eq(contestEntries.contestWeekId, weekId),
      ),
    )
    .where(eq(users.accountState, "active"))
    .orderBy(asc(profiles.normalizedDisplayName));

  return rows.map((row) => ({
    userId: row.userId,
    displayName: row.displayName,
    picks: row.picks ?? {},
    updatedAt: row.updatedAt?.toISOString() ?? null,
  }));
}

export async function getLivePlayerPicks(weekId: string): Promise<LivePlayerPicks[] | null> {
  const [week] = await getDb()
    .select({ id: contestWeeks.id })
    .from(contestWeeks)
    .where(and(eq(contestWeeks.id, weekId), eq(contestWeeks.status, "published")))
    .limit(1);
  if (!week) return null;
  return loadLivePlayerPicks(week.id);
}

export async function getCurrentPlayerWeek(
  userId: string,
  input: { includeLivePicks?: boolean } = {},
): Promise<PlayerWeek | null> {
  const db = getDb();
  const [week] = await db
    .select()
    .from(contestWeeks)
    .where(eq(contestWeeks.status, "published"))
    .orderBy(desc(contestWeeks.publishedAt), desc(contestWeeks.updatedAt))
    .limit(1);

  if (!week) return null;

  const [gameRows, entryRows, livePlayerPicks] = await Promise.all([
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
    input.includeLivePicks ? loadLivePlayerPicks(week.id) : Promise.resolve([]),
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
      status: game.status,
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
    livePlayerPicks,
  };
}
