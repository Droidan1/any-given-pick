import "server-only";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { boardSettings } from "@/lib/db/schema";
import type { BoardSettings } from "./board-rules";

export type BoardTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export async function getBoardSettings(): Promise<BoardSettings> {
  const [settings] = await getDb().select().from(boardSettings).where(eq(boardSettings.id, 1));
  if (!settings) throw new Error("Board settings migration has not been applied.");
  return settings;
}

/** Settings changes wait for in-flight entry writes, and vice versa. */
export async function lockBoardSettings(transaction: BoardTransaction) {
  const [settings] = await transaction.select().from(boardSettings).where(eq(boardSettings.id, 1)).for("share");
  if (!settings) throw new Error("Board settings migration has not been applied.");
  return settings;
}

export async function lockPlayerBoards(transaction: BoardTransaction, userId: string, weekId: string) {
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId + ":" + weekId}, 0))`);
}
