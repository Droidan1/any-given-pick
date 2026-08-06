"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { formatWeekName } from "@/lib/admin/schedule-import";
import { parseSeasonScheduleText } from "@/lib/admin/season-import";
import { requireAdminUser } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import { auditEvents, contestWeeks, games } from "@/lib/db/schema";

export type SeasonImportActionResult = {
  ok: boolean;
  message: string;
  weekIds?: string[];
  issues?: Array<{ code: string; message: string; row?: number; field?: string }>;
};

export async function importSeasonDrafts(input: {
  season: number;
  scheduleText: string;
}): Promise<SeasonImportActionResult> {
  const admin = await requireAdminUser();
  const parsed = parseSeasonScheduleText(input.scheduleText, input.season);
  const errors = parsed.issues.filter((issue) => issue.severity === "error");

  if (errors.length > 0 || parsed.weeks.length === 0) {
    return {
      ok: false,
      message: errors.length > 0
        ? `Fix ${errors.length} season ${errors.length === 1 ? "error" : "errors"} before creating drafts.`
        : "Add at least one valid week before creating drafts.",
      issues: errors.map(({ code, message, row, field }) => ({ code, message, row, field })),
    };
  }

  const db = getDb();
  const now = new Date();
  const result = await db.transaction(async (transaction) => {
    const existingWeeks = await transaction
      .select({
        id: contestWeeks.id,
        seasonPhase: contestWeeks.seasonPhase,
        weekNumber: contestWeeks.weekNumber,
        status: contestWeeks.status,
      })
      .from(contestWeeks)
      .where(eq(contestWeeks.season, input.season));

    const protectedWeek = existingWeeks.find((week) => week.status !== "draft");
    if (protectedWeek) {
      return {
        ok: false as const,
        message: `${formatWeekName(protectedWeek.seasonPhase, protectedWeek.weekNumber)} is ${protectedWeek.status}. The season import stopped before changing any drafts.`,
      };
    }

    const importedWeekKeys = new Set(parsed.weeks.map((week) => `${week.seasonPhase}:${week.weekNumber}`));
    const replacedDrafts = existingWeeks.filter((week) =>
      week.status === "draft" && importedWeekKeys.has(`${week.seasonPhase}:${week.weekNumber}`),
    ).length;
    const weekIds: string[] = [];
    for (const week of parsed.weeks) {
      const [savedWeek] = await transaction
        .insert(contestWeeks)
        .values({
          season: input.season,
          seasonPhase: week.seasonPhase,
          weekNumber: week.weekNumber,
          label: week.label || null,
          entryDeadline: new Date(week.entryDeadline),
          createdByUserId: admin.id,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [contestWeeks.season, contestWeeks.seasonPhase, contestWeeks.weekNumber],
          set: {
            label: week.label || null,
            entryDeadline: new Date(week.entryDeadline),
            updatedAt: now,
          },
        })
        .returning({ id: contestWeeks.id });

      await transaction.delete(games).where(eq(games.contestWeekId, savedWeek.id));
      await transaction.insert(games).values(
        week.games.map((game, sortOrder) => ({
          contestWeekId: savedWeek.id,
          provider: "manual",
          providerGameKey: game.providerGameKey,
          kickoffAt: new Date(game.kickoffAt),
          awayTeamCode: game.awayTeamCode,
          awayTeamName: game.awayTeamName,
          homeTeamCode: game.homeTeamCode,
          homeTeamName: game.homeTeamName,
          isMondayTiebreaker: game.isMondayTiebreaker,
          sortOrder,
        })),
      );
      await transaction.insert(auditEvents).values({
        actorUserId: admin.id,
        action: "contest_week.season_imported",
        entityType: "contest_week",
        entityId: savedWeek.id,
        metadata: {
          season: input.season,
          season_phase: week.seasonPhase,
          week_number: week.weekNumber,
          game_count: week.games.length,
          tiebreaker_selection: week.tiebreakerSelection,
          import_provider: "manual",
        },
      });
      weekIds.push(savedWeek.id);
    }

    return {
      ok: true as const,
      weekIds,
      replacedDrafts,
    };
  });

  if (!result.ok) return result;

  revalidatePath("/admin/weeks");
  revalidatePath("/admin/weeks/import");
  const createdDrafts = result.weekIds.length - result.replacedDrafts;
  return {
    ok: true,
    weekIds: result.weekIds,
    message: `${result.weekIds.length} private week ${result.weekIds.length === 1 ? "draft is" : "drafts are"} ready: ${createdDrafts} created and ${result.replacedDrafts} replaced. Nothing was published.`,
  };
}
