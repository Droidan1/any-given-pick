"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppUser } from "@/lib/auth/app-user";
import { requireParticipationEligibility } from "@/lib/eligibility/authorize";
import { getDb } from "@/lib/db";
import { auditEvents, contestEntries, contestWeeks } from "@/lib/db/schema";
import { boardLimit } from "@/lib/entries/board-rules";
import { lockBoardSettings, lockPlayerBoards } from "@/lib/entries/board-settings";

const schema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("create"), weekId: z.uuid(), name: z.string().trim().min(1).max(40), copyFromId: z.uuid().optional() }),
  z.object({ intent: z.literal("rename"), weekId: z.uuid(), boardId: z.uuid(), name: z.string().trim().min(1).max(40) }),
  z.object({ intent: z.literal("delete"), weekId: z.uuid(), boardId: z.uuid() }),
]);

export type BoardMutation = z.infer<typeof schema>;
export type BoardMutationResult = { ok: boolean; message: string; boardId?: string };

export async function manageBoard(input: BoardMutation): Promise<BoardMutationResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter a board name of 1–40 characters and a valid week." };
  const data = parsed.data;
  const user = await requireAppUser();
  try {
    await requireParticipationEligibility(user.id);
    const result = await getDb().transaction(async transaction => {
      const settings = await lockBoardSettings(transaction);
      await lockPlayerBoards(transaction, user.id, data.weekId);
      const [week] = await transaction.select().from(contestWeeks).where(eq(contestWeeks.id, data.weekId)).for("share");
      const clock = await transaction.execute<{ now: Date }>(sql`select clock_timestamp() as now`);
      const now = new Date(clock.rows[0].now);
      if (!week || week.status !== "published" || now >= week.entryDeadline) {
        return { ok: false, message: "This week is closed. Boards can no longer be changed." };
      }
      const entries = await transaction.select().from(contestEntries).where(and(
        eq(contestEntries.userId, user.id), eq(contestEntries.contestWeekId, week.id),
      )).orderBy(asc(contestEntries.boardNumber)).for("update");
      let boardId: string;
      if (data.intent === "create") {
        const active = entries.filter(entry => !entry.archivedAt);
        if (active.length >= boardLimit(settings)) return { ok: false, message: "The board limit has been reached. Refresh to see the current rules." };
        const source = data.copyFromId ? entries.find(entry => entry.id === data.copyFromId && !entry.archivedAt && entry.status !== "disqualified") : undefined;
        if (data.copyFromId && !source) return { ok: false, message: "That board is not available to copy." };
        const boardNumber = entries.reduce((highest, entry) => Math.max(highest, entry.boardNumber), 0) + 1;
        const [entry] = await transaction.insert(contestEntries).values({
          userId: user.id, contestWeekId: week.id, boardNumber, boardName: data.name,
          draftPicks: source?.draftPicks ?? {}, draftMondayPrediction: source?.draftMondayPrediction ?? null,
        }).returning({ id: contestEntries.id });
        boardId = entry.id;
      } else {
        const entry = entries.find(entry => entry.id === data.boardId);
        if (!entry || entry.archivedAt || ["locked", "scored", "disqualified"].includes(entry.status)) {
          return { ok: false, message: "That board is unavailable or can no longer be changed." };
        }
        boardId = entry.id;
        if (data.intent === "delete") {
          if (entry.boardNumber === 1 || entry.currentVersionNumber > 0 || entry.lastResetAt !== null) return { ok: false, message: "Board 1 and boards with submission or reset history cannot be deleted." };
          await transaction.delete(contestEntries).where(eq(contestEntries.id, entry.id));
        } else {
          await transaction.update(contestEntries).set({ boardName: data.name, updatedAt: now }).where(eq(contestEntries.id, entry.id));
        }
      }
      await transaction.insert(auditEvents).values({
        actorUserId: user.id, targetUserId: user.id, action: `board.${data.intent}`, entityType: "contest_entry", entityId: boardId,
        metadata: { contest_week_id: week.id, ...(data.intent === "create" ? { copied_from_id: data.copyFromId ?? null } : {}) },
      });
      return { ok: true, boardId, message: data.intent === "create" ? "Board created as a separate draft." : data.intent === "rename" ? "Board renamed." : "Draft deleted." };
    });
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch {
    return { ok: false, message: "The board could not be changed. Check your eligibility and try again." };
  }
}
