"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import {
  formatWeekName,
  parseScheduleText,
  validateWeekDetails,
  type SeasonPhase,
} from "@/lib/admin/schedule-import";
import { requireAdminUser } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import { auditEvents, contestWeeks, games } from "@/lib/db/schema";
import {
  processQueuedPlayerEmails,
  queueAndProcessWeekPublishedEmails,
  queueAvailableResultsEmails,
} from "@/lib/email/player-notifications";
import { reportOperationalIssue } from "@/lib/monitoring/operational-alerts";
import {
  processQueuedPlayerPushes,
  queueAndProcessWeekPublishedPushes,
  queueAvailableResultsPushes,
} from "@/lib/push/player-notifications";
import { runEspnScoreSyncWithHealth } from "@/lib/scores/health";
import { validatePublishableSlate } from "@/lib/admin/week-publish-policy";
import {
  gameRecoveryDecision,
  type GameRecoveryCommand,
} from "@/lib/admin/game-recovery-policy";

export type AdminActionResult = {
  ok: boolean;
  message: string;
  weekId?: string;
  issues?: Array<{ code: string; message: string; row?: number; field?: string }>;
};

export type SaveWeekDraftInput = {
  season: number;
  seasonPhase: SeasonPhase;
  weekNumber: number;
  label: string;
  entryDeadline: string;
  scheduleText: string;
};

export type RecoverGameInput = { gameId: string } & GameRecoveryCommand;

const recoverGameInputSchema = z.discriminatedUnion("action", [
  z.object({ gameId: z.uuid(), action: z.literal("postpone") }),
  z.object({ gameId: z.uuid(), action: z.literal("cancel") }),
  z.object({ gameId: z.uuid(), action: z.literal("reschedule"), kickoffAt: z.string().min(1) }),
]);

function revalidateGameSurfaces() {
  revalidatePath("/");
  revalidatePath("/activity");
  revalidatePath("/admin/weeks");
  revalidatePath("/results");
  revalidatePath("/standings");
}

function queueResultsNotifications() {
  after(async () => {
    try {
      await Promise.all([
        queueAvailableResultsEmails().then(() => processQueuedPlayerEmails()),
        queueAvailableResultsPushes().then(() => processQueuedPlayerPushes()),
      ]);
    } catch (error) {
      await reportOperationalIssue({
        kind: "player_notification_queue",
        identity: "results_available",
        severity: "warning",
        message: "A results-available notification could not be queued or processed.",
        context: { error_type: error instanceof Error ? error.name : "unknown" },
      });
    }
  });
}

export async function saveWeekDraft(input: SaveWeekDraftInput): Promise<AdminActionResult> {
  const admin = await requireAdminUser();
  const parsed = parseScheduleText(input.scheduleText);
  const issues = [
    ...parsed.issues,
    ...validateWeekDetails(
      {
        season: input.season,
        seasonPhase: input.seasonPhase,
        weekNumber: input.weekNumber,
        label: input.label.trim(),
        entryDeadline: input.entryDeadline,
      },
      parsed.games,
    ),
  ];
  const errors = issues.filter((issue) => issue.severity === "error");

  if (errors.length > 0) {
    return {
      ok: false,
      message: `Fix ${errors.length} schedule ${errors.length === 1 ? "error" : "errors"} before saving.`,
      issues: errors.map(({ code, message, row, field }) => ({ code, message, row, field })),
    };
  }

  const db = getDb();
  const now = new Date();
  const entryDeadline = new Date(input.entryDeadline);

  const result = await db.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ id: contestWeeks.id, status: contestWeeks.status })
      .from(contestWeeks)
      .where(
        and(
          eq(contestWeeks.season, input.season),
          eq(contestWeeks.seasonPhase, input.seasonPhase),
          eq(contestWeeks.weekNumber, input.weekNumber),
        ),
      )
      .for("update")
      .limit(1);

    if (existing && existing.status !== "draft") {
      return {
        ok: false as const,
        message: "Published, locked, or final weeks cannot be replaced by the importer.",
      };
    }

    const [week] = await transaction
      .insert(contestWeeks)
      .values({
        season: input.season,
        seasonPhase: input.seasonPhase,
        weekNumber: input.weekNumber,
        label: input.label.trim() || null,
        entryDeadline,
        createdByUserId: admin.id,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [contestWeeks.season, contestWeeks.seasonPhase, contestWeeks.weekNumber],
        setWhere: eq(contestWeeks.status, "draft"),
        set: {
          label: input.label.trim() || null,
          entryDeadline,
          updatedAt: now,
        },
      })
      .returning({ id: contestWeeks.id });

    if (!week) {
      return {
        ok: false as const,
        message: "This week changed before the draft could be saved. Review it and try again.",
      };
    }

    await transaction.delete(games).where(eq(games.contestWeekId, week.id));
    await transaction.insert(games).values(
      parsed.games.map((game, sortOrder) => ({
        contestWeekId: week.id,
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
      action: "contest_week.schedule_saved",
      entityType: "contest_week",
      entityId: week.id,
      metadata: {
        season: input.season,
        season_phase: input.seasonPhase,
        week_number: input.weekNumber,
        game_count: parsed.games.length,
        import_provider: "manual",
      },
    });

    return { ok: true as const, weekId: week.id };
  });

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath("/admin/weeks");
  return {
    ok: true,
    weekId: result.weekId,
    message: `${formatWeekName(input.seasonPhase, input.weekNumber)} saved as a ${parsed.games.length}-game draft.`,
  };
}

export async function publishWeek(weekId: string): Promise<AdminActionResult> {
  const admin = await requireAdminUser();
  const db = getDb();
  const now = new Date();

  const result = await db.transaction(async (transaction) => {
    const [week] = await transaction
      .select()
      .from(contestWeeks)
      .where(eq(contestWeeks.id, weekId))
      .for("update")
      .limit(1);
    if (!week) return { ok: false as const, message: "Week not found." };
    if (week.status !== "draft") {
      return { ok: false as const, message: "Only draft weeks can be published." };
    }

    const weekGames = await transaction
      .select({
        kickoffAt: games.kickoffAt,
        awayTeamCode: games.awayTeamCode,
        homeTeamCode: games.homeTeamCode,
        isMondayTiebreaker: games.isMondayTiebreaker,
      })
      .from(games)
      .where(eq(games.contestWeekId, week.id));
    if (weekGames.length === 0) {
      return { ok: false as const, message: "Add at least one game before publishing." };
    }
    if (week.entryDeadline <= now) {
      return { ok: false as const, message: "Move the entry deadline into the future before publishing." };
    }
    if (weekGames.some((game) => game.kickoffAt <= week.entryDeadline)) {
      return { ok: false as const, message: "Every kickoff must occur after the entry deadline." };
    }
    const slateIssues = validatePublishableSlate(week.seasonPhase, weekGames);
    if (slateIssues.length > 0) {
      return {
        ok: false as const,
        message: slateIssues.join(" "),
      };
    }

    const previouslyPublished = await transaction
      .update(contestWeeks)
      .set({ status: "locked", updatedAt: now })
      .where(and(eq(contestWeeks.status, "published"), ne(contestWeeks.id, week.id)))
      .returning({ id: contestWeeks.id });

    const [publishedWeek] = await transaction
      .update(contestWeeks)
      .set({ status: "published", publishedAt: now, updatedAt: now })
      .where(and(eq(contestWeeks.id, week.id), eq(contestWeeks.status, "draft")))
      .returning({ id: contestWeeks.id });
    if (!publishedWeek) {
      return { ok: false as const, message: "This week changed before it could be published. Review it and try again." };
    }
    await transaction.insert(auditEvents).values({
      actorUserId: admin.id,
      action: "contest_week.published",
      entityType: "contest_week",
      entityId: week.id,
      metadata: {
        season: week.season,
        season_phase: week.seasonPhase,
        week_number: week.weekNumber,
        game_count: weekGames.length,
        previous_active_weeks_locked: previouslyPublished.length,
      },
    });

    return {
      ok: true as const,
      weekId: week.id,
      message: `${formatWeekName(week.seasonPhase, week.weekNumber)} is published.`,
    };
  });

  if (result.ok) {
    after(async () => {
      try {
        await runEspnScoreSyncWithHealth();
      } catch (error) {
        await reportOperationalIssue({
          kind: "score_sync",
          identity: `week_published:${result.weekId}`,
          severity: "warning",
          message: "Published week odds could not be preloaded immediately.",
          context: { error_type: error instanceof Error ? error.name : "unknown" },
        });
      }
      try {
        await Promise.all([
          queueAndProcessWeekPublishedEmails(result.weekId),
          queueAndProcessWeekPublishedPushes(result.weekId),
        ]);
      } catch (error) {
        await reportOperationalIssue({
          kind: "player_notification_queue",
          identity: "week_published",
          severity: "warning",
          message: "A week-published notification could not be queued or processed.",
          context: { error_type: error instanceof Error ? error.name : "unknown" },
        });
      }
    });
    revalidatePath("/admin/weeks");
  }
  return result;
}

export async function saveFinalScore(input: {
  gameId: string;
  awayScore: number;
  homeScore: number;
}): Promise<AdminActionResult> {
  const admin = await requireAdminUser();
  if (
    !Number.isInteger(input.awayScore) ||
    !Number.isInteger(input.homeScore) ||
    input.awayScore < 0 ||
    input.homeScore < 0 ||
    input.awayScore > 100 ||
    input.homeScore > 100
  ) {
    return { ok: false, message: "Scores must be whole numbers from 0 to 100." };
  }

  const db = getDb();
  const now = new Date();
  const result = await db.transaction(async (transaction) => {
    const [game] = await transaction
      .update(games)
      .set({
        awayScore: input.awayScore,
        homeScore: input.homeScore,
        status: "final",
        updatedAt: now,
      })
      .where(eq(games.id, input.gameId))
      .returning({ id: games.id, contestWeekId: games.contestWeekId });
    if (!game) return { ok: false as const, message: "Game not found." };

    await transaction.insert(auditEvents).values({
      actorUserId: admin.id,
      action: "game.final_score_saved",
      entityType: "game",
      entityId: game.id,
      metadata: { contest_week_id: game.contestWeekId },
    });
    return { ok: true as const, weekId: game.contestWeekId, message: "Final score saved." };
  });

  if (result.ok) {
    queueResultsNotifications();
    revalidateGameSurfaces();
  }
  return result;
}

export async function recoverGame(input: RecoverGameInput): Promise<AdminActionResult> {
  const parsed = recoverGameInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The game recovery request was not valid." };

  const admin = await requireAdminUser();
  const now = new Date();
  const decision = gameRecoveryDecision(parsed.data as GameRecoveryCommand, now);
  if (!decision.ok) return decision;

  const db = getDb();
  const result = await db.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({
        id: games.id,
        contestWeekId: games.contestWeekId,
        status: games.status,
        kickoffAt: games.kickoffAt,
      })
      .from(games)
      .where(eq(games.id, parsed.data.gameId))
      .for("update")
      .limit(1);
    if (!existing) return { ok: false as const, message: "Game not found." };

    const [updated] = await transaction
      .update(games)
      .set({
        status: decision.status,
        kickoffAt: decision.kickoffAt ?? existing.kickoffAt,
        awayScore: null,
        homeScore: null,
        updatedAt: now,
      })
      .where(eq(games.id, existing.id))
      .returning({ id: games.id });
    if (!updated) return { ok: false as const, message: "The game changed before it could be updated." };

    await transaction.insert(auditEvents).values({
      actorUserId: admin.id,
      action: `game.${parsed.data.action}`,
      entityType: "game",
      entityId: existing.id,
      metadata: {
        contest_week_id: existing.contestWeekId,
        previous_status: existing.status,
        previous_kickoff_at: existing.kickoffAt.toISOString(),
        next_status: decision.status,
        next_kickoff_at: (decision.kickoffAt ?? existing.kickoffAt).toISOString(),
      },
    });

    const message = parsed.data.action === "postpone"
      ? "Game marked postponed. It will remain on the board and continue syncing."
      : parsed.data.action === "cancel"
        ? "Game canceled. Its picks are void and the week can complete without a score."
        : "New kickoff saved. The game is scheduled again and automatic syncing will continue.";
    return { ok: true as const, weekId: existing.contestWeekId, message };
  });

  if (result.ok) {
    if (parsed.data.action === "cancel") queueResultsNotifications();
    revalidateGameSurfaces();
  }
  return result;
}
