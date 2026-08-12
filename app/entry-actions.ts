"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireAppUser } from "@/lib/auth/app-user";
import {
  ParticipationForbiddenError,
  requireParticipationEligibility,
} from "@/lib/eligibility/authorize";
import { getDb } from "@/lib/db";
import {
  auditEvents,
  contestEntries,
  contestWeeks,
  entryVersionPicks,
  entryVersions,
  games,
} from "@/lib/db/schema";
import { validateEntrySelections } from "@/lib/entries/rules";
import type {
  EntryActionResult,
  EntryMutationInput,
} from "@/lib/entries/types";
import { queueAndProcessSubmissionConfirmation } from "@/lib/email/player-notifications";
import { reportOperationalIssue } from "@/lib/monitoring/operational-alerts";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const entryInputSchema = z.object({
  weekId: z.uuid(),
  picks: z.record(z.string(), z.string()),
  mondayPrediction: z.number().int().min(0).max(200).nullable(),
});

const submissionInputSchema = entryInputSchema.extend({ submissionKey: z.uuid() });

function invalidInput(): EntryActionResult {
  return { ok: false, code: "invalid_input", message: "The entry data was not valid." };
}

function selectionFailure(
  issues: ReturnType<typeof validateEntrySelections>["issues"],
  complete: boolean,
): EntryActionResult {
  const hasMissing = issues.some(
    (issue) => issue.code === "missing_pick" || issue.code === "invalid_monday_prediction",
  );
  return {
    ok: false,
    code: complete && hasMissing ? "incomplete" : "invalid_pick",
    message:
      complete && hasMissing
        ? "Pick every game and enter a valid tiebreaker total before submitting."
        : "One or more selections do not belong to this week.",
  };
}

function failureFromError(error: unknown): EntryActionResult {
  if (error instanceof ParticipationForbiddenError) {
    return {
      ok: false,
      code: "ineligible",
      message: "Your current eligibility status allows read-only access only.",
    };
  }
  return {
    ok: false,
    code: "server_error",
    message: "The entry could not be saved. Your existing submission was not changed.",
  };
}

export async function saveEntryDraft(input: EntryMutationInput): Promise<EntryActionResult> {
  const parsed = entryInputSchema.safeParse(input);
  if (!parsed.success || Object.keys(parsed.data.picks).length > 32) return invalidInput();

  try {
    const appUser = await requireAppUser();
    const rateLimit = await consumeRateLimit({
      scope: "entry_draft",
      identifier: appUser.id,
      limit: 120,
      windowMs: 10 * 60 * 1_000,
    });
    if (!rateLimit.allowed) {
      return { ok: false, code: "rate_limited", message: "Draft syncing paused briefly. Wait a moment and try again." };
    }
    await requireParticipationEligibility(appUser.id);
    const db = getDb();

    const result = await db.transaction(async (transaction): Promise<EntryActionResult> => {
      const clock = await transaction.execute<{ now: Date }>(sql`select now() as now`);
      const now = new Date(clock.rows[0].now);
      const [week] = await transaction
        .select()
        .from(contestWeeks)
        .where(eq(contestWeeks.id, parsed.data.weekId))
        .limit(1);

      if (!week) return { ok: false, code: "not_found", message: "This week was not found." };
      if (week.status !== "published") {
        return { ok: false, code: "not_open", message: "This week is not open for entries." };
      }
      if (now >= week.entryDeadline) {
        return { ok: false, code: "deadline_passed", message: "The entry deadline has passed." };
      }

      const weekGames = await transaction
        .select({
          id: games.id,
          awayTeamCode: games.awayTeamCode,
          homeTeamCode: games.homeTeamCode,
        })
        .from(games)
        .where(eq(games.contestWeekId, week.id));
      const validated = validateEntrySelections({
        games: weekGames,
        picks: parsed.data.picks,
        mondayPrediction: parsed.data.mondayPrediction,
        requireComplete: false,
      });
      if (validated.issues.length > 0) return selectionFailure(validated.issues, false);

      const [existing] = await transaction
        .select()
        .from(contestEntries)
        .where(
          and(
            eq(contestEntries.contestWeekId, week.id),
            eq(contestEntries.userId, appUser.id),
          ),
        )
        .for("update")
        .limit(1);

      if (existing && ["locked", "scored", "disqualified"].includes(existing.status)) {
        return { ok: false, code: "not_open", message: "This entry can no longer be edited." };
      }

      const [entry] = existing
        ? await transaction
            .update(contestEntries)
            .set({
              draftPicks: validated.picks,
              draftMondayPrediction: parsed.data.mondayPrediction,
              updatedAt: now,
            })
            .where(eq(contestEntries.id, existing.id))
            .returning({ id: contestEntries.id })
        : await transaction
            .insert(contestEntries)
            .values({
              contestWeekId: week.id,
              userId: appUser.id,
              draftPicks: validated.picks,
              draftMondayPrediction: parsed.data.mondayPrediction,
              updatedAt: now,
            })
            .returning({ id: contestEntries.id });

      await transaction.insert(auditEvents).values({
        actorUserId: appUser.id,
        targetUserId: appUser.id,
        action: "entry.draft_saved",
        entityType: "contest_entry",
        entityId: entry.id,
        metadata: {
          contest_week_id: week.id,
          pick_count: Object.keys(validated.picks).length,
          required_pick_count: weekGames.length,
        },
      });

      return {
        ok: true,
        code: "saved",
        message: "Draft synced securely.",
        syncedAt: now.toISOString(),
      };
    });

    return result;
  } catch (error) {
    if (!(error instanceof ParticipationForbiddenError)) {
      await reportOperationalIssue({
        kind: "entry_draft",
        identity: error instanceof Error ? error.name : "unknown",
        severity: "error",
        message: "A player draft could not be saved.",
        context: { action: "save_draft" },
      });
    }
    return failureFromError(error);
  }
}

export async function submitEntry(
  input: EntryMutationInput & { submissionKey: string },
): Promise<EntryActionResult> {
  const parsed = submissionInputSchema.safeParse(input);
  if (!parsed.success || Object.keys(parsed.data.picks).length > 32) return invalidInput();

  try {
    const appUser = await requireAppUser();
    const rateLimit = await consumeRateLimit({
      scope: "entry_submission",
      identifier: appUser.id,
      limit: 20,
      windowMs: 60 * 60 * 1_000,
    });
    if (!rateLimit.allowed) {
      return { ok: false, code: "rate_limited", message: "Too many submission attempts. Wait before trying again." };
    }
    const account = await requireParticipationEligibility(appUser.id);
    const db = getDb();

    const result = await db.transaction(async (transaction): Promise<EntryActionResult> => {
      const [duplicate] = await transaction
        .select({
          versionNumber: entryVersions.versionNumber,
          committedAt: entryVersions.committedAt,
          action: entryVersions.action,
        })
        .from(entryVersions)
        .innerJoin(contestEntries, eq(contestEntries.id, entryVersions.contestEntryId))
        .where(
          and(
            eq(entryVersions.submissionKey, parsed.data.submissionKey),
            eq(contestEntries.userId, appUser.id),
            eq(contestEntries.contestWeekId, parsed.data.weekId),
          ),
        )
        .limit(1);
      if (duplicate) {
        return {
          ok: true,
          code: "submitted",
          message: "Your committed entry was already received.",
          receipt: {
            versionNumber: duplicate.versionNumber,
            committedAt: duplicate.committedAt.toISOString(),
            action: duplicate.action as "submit" | "edit",
          },
        };
      }

      const clock = await transaction.execute<{ now: Date }>(sql`select now() as now`);
      const now = new Date(clock.rows[0].now);
      const [week] = await transaction
        .select()
        .from(contestWeeks)
        .where(eq(contestWeeks.id, parsed.data.weekId))
        .limit(1);

      if (!week) return { ok: false, code: "not_found", message: "This week was not found." };
      if (week.status !== "published") {
        return { ok: false, code: "not_open", message: "This week is not open for entries." };
      }
      if (now >= week.entryDeadline) {
        return { ok: false, code: "deadline_passed", message: "The entry deadline has passed." };
      }

      const weekGames = await transaction
        .select({
          id: games.id,
          awayTeamCode: games.awayTeamCode,
          homeTeamCode: games.homeTeamCode,
          sortOrder: games.sortOrder,
        })
        .from(games)
        .where(eq(games.contestWeekId, week.id))
        .orderBy(asc(games.sortOrder));
      const validated = validateEntrySelections({
        games: weekGames,
        picks: parsed.data.picks,
        mondayPrediction: parsed.data.mondayPrediction,
        requireComplete: true,
      });
      if (validated.issues.length > 0 || parsed.data.mondayPrediction === null) {
        return selectionFailure(validated.issues, true);
      }

      const [existing] = await transaction
        .select()
        .from(contestEntries)
        .where(
          and(
            eq(contestEntries.contestWeekId, week.id),
            eq(contestEntries.userId, appUser.id),
          ),
        )
        .for("update")
        .limit(1);
      if (existing && ["locked", "scored", "disqualified"].includes(existing.status)) {
        return { ok: false, code: "not_open", message: "This entry can no longer be edited." };
      }

      const [entry] = existing
        ? [existing]
        : await transaction
            .insert(contestEntries)
            .values({
              contestWeekId: week.id,
              userId: appUser.id,
              draftPicks: validated.picks,
              draftMondayPrediction: parsed.data.mondayPrediction,
              updatedAt: now,
            })
            .returning();
      const versionNumber = entry.currentVersionNumber + 1;
      const action = entry.currentVersionNumber === 0 ? "submit" : "edit";

      const [version] = await transaction
        .insert(entryVersions)
        .values({
          contestEntryId: entry.id,
          versionNumber,
          submissionKey: parsed.data.submissionKey,
          action,
          mondayPrediction: parsed.data.mondayPrediction,
          eligibilitySnapshot: {
            reason: account.reason,
            locationResult: account.locationResult,
            locationCheckedAt: account.locationCheckedAt,
          },
          committedAt: now,
        })
        .returning({ id: entryVersions.id, committedAt: entryVersions.committedAt });

      await transaction.insert(entryVersionPicks).values(
        weekGames.map((game) => ({
          entryVersionId: version.id,
          gameId: game.id,
          selectedTeamCode: validated.picks[game.id],
        })),
      );

      await transaction
        .update(contestEntries)
        .set({
          status: "submitted",
          draftPicks: validated.picks,
          draftMondayPrediction: parsed.data.mondayPrediction,
          currentVersionNumber: versionNumber,
          submittedAt: now,
          updatedAt: now,
        })
        .where(eq(contestEntries.id, entry.id));

      await transaction.insert(auditEvents).values({
        actorUserId: appUser.id,
        targetUserId: appUser.id,
        action: action === "submit" ? "entry.submitted" : "entry.edit_committed",
        entityType: "contest_entry",
        entityId: entry.id,
        metadata: {
          contest_week_id: week.id,
          version_number: versionNumber,
          pick_count: weekGames.length,
          eligibility_reason: account.reason,
        },
      });

      return {
        ok: true,
        code: "submitted",
        message: action === "submit" ? "Entry submitted." : "Entry edit committed.",
        receipt: {
          versionNumber,
          committedAt: version.committedAt.toISOString(),
          action,
        },
      };
    });

    if (result.ok) {
      after(async () => {
        try {
          await queueAndProcessSubmissionConfirmation({
            userId: appUser.id,
            weekId: parsed.data.weekId,
            submissionKey: parsed.data.submissionKey,
          });
        } catch (error) {
          await reportOperationalIssue({
            kind: "player_email_queue",
            identity: "picks_submitted",
            severity: "warning",
            message: "A picks-submitted email could not be queued or processed.",
            context: { error_type: error instanceof Error ? error.name : "unknown" },
          });
        }
      });
      revalidatePath("/");
    }
    return result;
  } catch (error) {
    if (!(error instanceof ParticipationForbiddenError)) {
      await reportOperationalIssue({
        kind: "entry_submission",
        identity: error instanceof Error ? error.name : "unknown",
        severity: "error",
        message: "An official player entry could not be submitted.",
        context: { action: "submit_entry" },
      });
    }
    return failureFromError(error);
  }
}
