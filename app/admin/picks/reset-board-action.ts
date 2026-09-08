"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import { auditEvents, contestEntries, contestWeeks } from "@/lib/db/schema";
import { lockBoardSettings, lockPlayerBoards } from "@/lib/entries/board-settings";
import type { ResetBoardRequest } from "./reset-board-control";

const resetInput = z.object({
  boardId: z.uuid(),
  expectedDraftRevision: z.number().int().nonnegative(),
  expectedVersionNumber: z.number().int().nonnegative(),
  reason: z.string().trim().max(240),
  confirmed: z.literal(true),
});

export async function resetPlayerBoard(input: ResetBoardRequest): Promise<{ ok: boolean; message: string }> {
  const actor = await requireAdminUser();
  const parsed = resetInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confirm the board reset before continuing." };

  const result = await getDb().transaction(async transaction => {
    await lockBoardSettings(transaction);
    const [target] = await transaction.select({ userId: contestEntries.userId, weekId: contestEntries.contestWeekId })
      .from(contestEntries).where(eq(contestEntries.id, parsed.data.boardId));
    if (!target) return { ok: false, message: "This board no longer exists. Refresh the player list." };
    await lockPlayerBoards(transaction, target.userId, target.weekId);
    const [week] = await transaction.select().from(contestWeeks).where(eq(contestWeeks.id, target.weekId)).for("share");
    const [entry] = await transaction.select().from(contestEntries).where(eq(contestEntries.id, parsed.data.boardId)).for("update");
    const clock = await transaction.execute<{ now: Date }>(sql`select clock_timestamp() as now`);
    const now = new Date(clock.rows[0].now);
    if (!week || week.status !== "published" || now >= week.entryDeadline) {
      return { ok: false, message: "The deadline has passed or this week is closed. Boards can only be reset before the deadline." };
    }
    if (!entry || entry.archivedAt || ["locked", "scored", "disqualified"].includes(entry.status)) {
      return { ok: false, message: "Archived, locked, and disqualified boards cannot be reset." };
    }
    if (entry.draftRevision !== parsed.data.expectedDraftRevision || entry.currentVersionNumber !== parsed.data.expectedVersionNumber) {
      return { ok: false, message: "This board changed after you opened it. Review its current status and confirm again." };
    }
    const resetRevision = entry.draftRevision + 1;
    await transaction.update(contestEntries).set({
      draftPicks: {}, draftMondayPrediction: null, draftRevision: resetRevision,
      resetRevision, resetVersionNumber: Math.max(entry.resetVersionNumber, entry.currentVersionNumber), lastResetAt: now, currentVersionNumber: 0,
      submittedAt: null, lockedAt: null, status: "draft", updatedAt: now,
    }).where(eq(contestEntries.id, entry.id));
    await transaction.insert(auditEvents).values({
      actorUserId: actor.id, targetUserId: entry.userId, action: "board.reset",
      entityType: "contest_entry", entityId: entry.id,
      metadata: { contest_week_id: week.id, board_number: entry.boardNumber, board_name: entry.boardName,
        previous_version_number: entry.currentVersionNumber, previous_draft_revision: entry.draftRevision,
        previous_draft_pick_count: Object.keys(entry.draftPicks).length, reset_revision: resetRevision,
        reason: parsed.data.reason || null },
    });
    return { ok: true, message: `${entry.boardName} was reset. The player must submit again before the deadline to count toward scoring. Past submissions are preserved.` };
  });
  if (result.ok) { updateTag("season-standings"); revalidatePath("/", "layout"); }
  return result;
}
