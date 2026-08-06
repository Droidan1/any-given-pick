import "server-only";

import { asc, count, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contestWeeks, games } from "@/lib/db/schema";

export type AdminWeekSummary = {
  id: string;
  season: number;
  weekNumber: number;
  label: string | null;
  status: "draft" | "published" | "locked" | "final";
  entryDeadline: string;
  publishedAt: string | null;
  gameCount: number;
};

export type AdminWeekDetail = AdminWeekSummary & {
  games: Array<{
    id: string;
    kickoffAt: string;
    awayTeamCode: string;
    awayTeamName: string;
    homeTeamCode: string;
    homeTeamName: string;
    isMondayTiebreaker: boolean;
    providerGameKey: string | null;
    status: "scheduled" | "in_progress" | "final" | "postponed" | "canceled";
    awayScore: number | null;
    homeScore: number | null;
  }>;
};

function iso(value: Date): string {
  return value.toISOString();
}

export async function listAdminWeeks(): Promise<AdminWeekSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: contestWeeks.id,
      season: contestWeeks.season,
      weekNumber: contestWeeks.weekNumber,
      label: contestWeeks.label,
      status: contestWeeks.status,
      entryDeadline: contestWeeks.entryDeadline,
      publishedAt: contestWeeks.publishedAt,
      gameCount: count(games.id),
    })
    .from(contestWeeks)
    .leftJoin(games, eq(games.contestWeekId, contestWeeks.id))
    .groupBy(contestWeeks.id)
    .orderBy(desc(contestWeeks.season), desc(contestWeeks.weekNumber))
    .limit(24);

  return rows.map((row) => ({
    ...row,
    entryDeadline: iso(row.entryDeadline),
    publishedAt: row.publishedAt ? iso(row.publishedAt) : null,
    gameCount: Number(row.gameCount),
  }));
}

export async function getAdminWeek(weekId: string): Promise<AdminWeekDetail | null> {
  const db = getDb();
  const [week] = await db
    .select()
    .from(contestWeeks)
    .where(eq(contestWeeks.id, weekId))
    .limit(1);
  if (!week) return null;

  const gameRows = await db
    .select()
    .from(games)
    .where(eq(games.contestWeekId, week.id))
    .orderBy(asc(games.sortOrder), asc(games.kickoffAt));

  return {
    id: week.id,
    season: week.season,
    weekNumber: week.weekNumber,
    label: week.label,
    status: week.status,
    entryDeadline: iso(week.entryDeadline),
    publishedAt: week.publishedAt ? iso(week.publishedAt) : null,
    gameCount: gameRows.length,
    games: gameRows.map((game) => ({
      id: game.id,
      kickoffAt: iso(game.kickoffAt),
      awayTeamCode: game.awayTeamCode,
      awayTeamName: game.awayTeamName,
      homeTeamCode: game.homeTeamCode,
      homeTeamName: game.homeTeamName,
      isMondayTiebreaker: game.isMondayTiebreaker,
      providerGameKey: game.providerGameKey,
      status: game.status,
      awayScore: game.awayScore,
      homeScore: game.homeScore,
    })),
  };
}
