import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { formatWeekName } from "@/lib/admin/schedule-import";
import { getDb } from "@/lib/db";
import { contestEntries, contestWeeks, entryVersionPicks, entryVersions, games, profiles, users } from "@/lib/db/schema";
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

async function loadLivePlayerPicks(weekId: string, isLocked: boolean): Promise<LivePlayerPicks[]> {
  const rows = await getDb()
    .select({
      userId: users.id,
      displayName: profiles.displayName,
      picks: contestEntries.draftPicks,
      mondayPrediction: contestEntries.draftMondayPrediction,
      officialVersionId: entryVersions.id,
      officialMondayPrediction: entryVersions.mondayPrediction,
      committedAt: entryVersions.committedAt,
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
    .leftJoin(entryVersions, and(
      eq(entryVersions.contestEntryId, contestEntries.id),
      eq(entryVersions.versionNumber, contestEntries.currentVersionNumber),
    ))
    .where(eq(users.accountState, "active"))
    .orderBy(asc(profiles.normalizedDisplayName));

  // At lock, never mix an unsubmitted draft with the official tiebreaker.
  const versionIds = rows.flatMap((row) => row.officialVersionId ? [row.officialVersionId] : []);
  const officialPicks = isLocked && versionIds.length > 0
    ? await getDb().select({
      versionId: entryVersionPicks.entryVersionId,
      gameId: entryVersionPicks.gameId,
      team: entryVersionPicks.selectedTeamCode,
    }).from(entryVersionPicks).where(inArray(entryVersionPicks.entryVersionId, versionIds))
    : [];
  const picksByVersion = new Map<string, Record<string, string>>();
  for (const pick of officialPicks) {
    const picks = picksByVersion.get(pick.versionId) ?? {};
    picks[pick.gameId] = pick.team;
    picksByVersion.set(pick.versionId, picks);
  }
  return rows.map((row) => ({
    userId: row.userId,
    displayName: row.displayName,
    picks: isLocked ? picksByVersion.get(row.officialVersionId ?? "") ?? {} : row.picks ?? {},
    mondayPrediction: (isLocked ? row.officialMondayPrediction : row.mondayPrediction) ?? null,
    cardState: isLocked ? (row.officialVersionId ? "official" : "none") : "saved",
    updatedAt: (isLocked ? row.committedAt : row.updatedAt)?.toISOString() ?? null,
  }));
}

export async function getLivePlayerPicks(weekId: string): Promise<LivePlayerPicks[] | null> {
  const [week] = await getDb()
    .select({ id: contestWeeks.id, status: contestWeeks.status, entryDeadline: contestWeeks.entryDeadline })
    .from(contestWeeks)
    .where(and(eq(contestWeeks.id, weekId), inArray(contestWeeks.status, ["published", "locked", "final"])))
    .limit(1);
  if (!week) return null;
  return loadLivePlayerPicks(week.id, week.status !== "published" || new Date() >= week.entryDeadline);
}

export async function getCurrentPlayerWeek(
  userId: string,
  input: { includeLivePicks?: boolean; weekId?: string } = {},
): Promise<PlayerWeek | null> {
  const db = getDb();
  const [week] = await db
    .select()
    .from(contestWeeks)
    .where(input.weekId
      ? and(eq(contestWeeks.id, input.weekId), inArray(contestWeeks.status, ["published", "locked", "final"]))
      : eq(contestWeeks.status, "published"))
    .orderBy(desc(contestWeeks.publishedAt), desc(contestWeeks.updatedAt))
    .limit(1);

  if (!week) return null;

  const now = new Date();
  const isLocked = week.status === "locked" || week.status === "final" || now >= week.entryDeadline;

  const [gameRows, entryRows, officialVersionRows, officialPickRows, livePlayerPicks] = await Promise.all([
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
    db
      .select({
        mondayPrediction: entryVersions.mondayPrediction,
        committedAt: entryVersions.committedAt,
      })
      .from(contestEntries)
      .innerJoin(
        entryVersions,
        and(
          eq(entryVersions.contestEntryId, contestEntries.id),
          eq(entryVersions.versionNumber, contestEntries.currentVersionNumber),
        ),
      )
      .where(
        and(
          eq(contestEntries.contestWeekId, week.id),
          eq(contestEntries.userId, userId),
        ),
      )
      .limit(1),
    db
      .select({
        gameId: entryVersionPicks.gameId,
        selectedTeamCode: entryVersionPicks.selectedTeamCode,
      })
      .from(contestEntries)
      .innerJoin(
        entryVersions,
        and(
          eq(entryVersions.contestEntryId, contestEntries.id),
          eq(entryVersions.versionNumber, contestEntries.currentVersionNumber),
        ),
      )
      .innerJoin(entryVersionPicks, eq(entryVersionPicks.entryVersionId, entryVersions.id))
      .where(
        and(
          eq(contestEntries.contestWeekId, week.id),
          eq(contestEntries.userId, userId),
        ),
      ),
    input.includeLivePicks ? loadLivePlayerPicks(week.id, isLocked) : Promise.resolve([]),
  ]);

  const entry = entryRows[0] ?? null;
  const officialVersion = officialVersionRows[0] ?? null;
  return {
    id: week.id,
    season: week.season,
    seasonPhase: week.seasonPhase,
    weekNumber: week.weekNumber,
    label: week.label || formatWeekName(week.seasonPhase, week.weekNumber),
    entryDeadline: week.entryDeadline.toISOString(),
    deadlineLabel: formatDeadline(week.entryDeadline),
    isLocked,
    games: gameRows.map((game) => ({
      id: game.id,
      kickoffAt: game.kickoffAt.toISOString(),
      status: game.status,
      ...formatKickoff(game.kickoffAt),
      away: { abbreviation: game.awayTeamCode, name: game.awayTeamName },
      home: { abbreviation: game.homeTeamCode, name: game.homeTeamName },
      awayScore: game.awayScore,
      homeScore: game.homeScore,
      scorePeriod: game.scorePeriod,
      scoreClock: game.scoreClock,
      scoreDetail: game.scoreDetail,
      scoreCheckedAt: game.scoreCheckedAt?.toISOString() ?? null,
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
          draftRevision: entry.draftRevision,
          officialPicks: Object.fromEntries(
            officialPickRows.map((pick) => [pick.gameId, pick.selectedTeamCode]),
          ),
          mondayPrediction: entry.draftMondayPrediction,
          officialMondayPrediction: officialVersion?.mondayPrediction ?? null,
          currentVersionNumber: entry.currentVersionNumber,
          submittedAt: officialVersion?.committedAt.toISOString() ?? entry.submittedAt?.toISOString() ?? null,
          updatedAt: entry.updatedAt.toISOString(),
        }
      : null,
    livePlayerPicks,
  };
}
