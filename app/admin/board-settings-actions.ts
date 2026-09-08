"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import { auditEvents, boardSettings } from "@/lib/db/schema";
import { boardLimit, type BoardSettings } from "@/lib/entries/board-rules";

const schema = z.object({
  multipleBoardsEnabled: z.boolean(),
  maxBoards: z.number().int().min(2).max(2147483647),
  revision: z.number().int().min(0),
  confirmed: z.boolean(),
});

export async function updateBoardSettings(input: BoardSettings & { confirmed: boolean }) {
  const actor = await requireAdminUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter a whole-number board limit of 2 or more." };
  try {
    const result = await getDb().transaction(async transaction => {
      const [previous] = await transaction.select().from(boardSettings).where(eq(boardSettings.id, 1)).for("update");
      if (!previous || previous.revision !== parsed.data.revision) {
        return { ok: false, message: "Another administrator changed these settings. Reload the page before saving." };
      }
      const limit = boardLimit(parsed.data);
      if (limit < boardLimit(previous) && !parsed.data.confirmed) {
        return { ok: false, message: "Confirm that extra boards will be archived and excluded from scoring." };
      }
      const archived = await transaction.execute<{ id: string }>(sql`
        with ranked as (
          select id, row_number() over (partition by contest_week_id, user_id order by board_number) as position
          from contest_entries where archived_at is null
        )
        update contest_entries set archived_at = clock_timestamp(), updated_at = clock_timestamp()
        from ranked where contest_entries.id = ranked.id and ranked.position > ${limit}
        returning contest_entries.id
      `);
      const [settings] = await transaction.update(boardSettings).set({
        multipleBoardsEnabled: parsed.data.multipleBoardsEnabled,
        maxBoards: parsed.data.maxBoards,
        revision: previous.revision + 1,
        updatedAt: new Date(),
      }).where(eq(boardSettings.id, 1)).returning();
      await transaction.insert(auditEvents).values({
        actorUserId: actor.id, action: "boards.settings_changed", entityType: "board_settings", entityId: "1",
        metadata: { previous_limit: boardLimit(previous), next_limit: limit, archived_count: archived.rows.length, revision: settings.revision },
      });
      return { ok: true, message: `Settings applied immediately. ${archived.rows.length} extra boards archived.`, settings };
    });
    if (result.ok) { updateTag("season-standings"); revalidatePath("/", "layout"); }
    return result;
  } catch {
    return { ok: false, message: "Settings could not be saved. No boards were changed." };
  }
}
