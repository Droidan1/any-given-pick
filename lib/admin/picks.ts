import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contestEntries, profiles, users } from "@/lib/db/schema";
import {
  getWeeklyResults,
  type WeeklyResults,
} from "@/lib/results/service";
import {
  buildAdminPlayerPickCards,
  type AdminPlayerPickCard,
  type AdminPicksRosterRow,
} from "./picks-rules";

export type { AdminPlayerPickCard } from "./picks-rules";

export type AdminPicksBoard = WeeklyResults & {
  players: AdminPlayerPickCard[];
  submittedCount: number;
  notSubmittedCount: number;
  disqualifiedCount: number;
};

export async function getAdminPicksBoard(input: {
  weekId?: string;
  currentUserId: string;
  now?: Date;
}): Promise<AdminPicksBoard> {
  const results = await getWeeklyResults(input);
  const selectedWeek = results.selectedWeek;
  if (!selectedWeek) {
    return {
      ...results,
      players: [],
      submittedCount: 0,
      notSubmittedCount: 0,
      disqualifiedCount: 0,
    };
  }

  const roster: AdminPicksRosterRow[] = await getDb()
    .select({
      userId: users.id,
      displayName: profiles.displayName,
      currentVersionNumber: contestEntries.currentVersionNumber,
      entryStatus: contestEntries.status,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(
      contestEntries,
      and(
        eq(contestEntries.userId, users.id),
        eq(contestEntries.contestWeekId, selectedWeek.id),
      ),
    )
    .where(eq(users.accountState, "active"))
    .orderBy(asc(profiles.normalizedDisplayName));

  const players = buildAdminPlayerPickCards({
    roster,
    entries: results.entries,
    revealStatus: results.revealStatus,
  });

  return {
    ...results,
    players,
    submittedCount: players.filter((player) => player.submissionStatus === "submitted").length,
    notSubmittedCount: players.filter((player) => player.submissionStatus === "not_submitted").length,
    disqualifiedCount: players.filter((player) => player.submissionStatus === "disqualified").length,
  };
}
