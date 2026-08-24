import "server-only";

import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { commissionerAnnouncements } from "@/lib/db/schema";
import { getAnnouncementDisplayState, type CommissionerAnnouncementDisplayState, type CommissionerAnnouncementStatus } from "./rules";

export type CommissionerAnnouncement = {
  id: string;
  title: string;
  body: string;
  status: CommissionerAnnouncementStatus;
  displayState: CommissionerAnnouncementDisplayState;
  startsAt: string;
  expiresAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

function serializeAnnouncement(
  row: typeof commissionerAnnouncements.$inferSelect,
  now: Date,
): CommissionerAnnouncement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status,
    displayState: getAnnouncementDisplayState({
      status: row.status,
      startsAt: row.startsAt,
      expiresAt: row.expiresAt,
      now,
    }),
    startsAt: row.startsAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCommissionerAnnouncements(): Promise<CommissionerAnnouncement[]> {
  const now = new Date();
  const rows = await getDb()
    .select()
    .from(commissionerAnnouncements)
    .orderBy(desc(commissionerAnnouncements.updatedAt))
    .limit(20);
  return rows.map((row) => serializeAnnouncement(row, now));
}

export async function getActiveCommissionerAnnouncement(): Promise<CommissionerAnnouncement | null> {
  const now = new Date();
  const [row] = await getDb()
    .select()
    .from(commissionerAnnouncements)
    .where(
      and(
        eq(commissionerAnnouncements.status, "published"),
        lte(commissionerAnnouncements.startsAt, now),
        or(
          isNull(commissionerAnnouncements.expiresAt),
          gt(commissionerAnnouncements.expiresAt, now),
        ),
      ),
    )
    .orderBy(desc(commissionerAnnouncements.startsAt), desc(commissionerAnnouncements.updatedAt))
    .limit(1);
  return row ? serializeAnnouncement(row, now) : null;
}
