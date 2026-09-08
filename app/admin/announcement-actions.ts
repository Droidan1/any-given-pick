"use server";

import { and, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import { auditEvents, commissionerAnnouncements } from "@/lib/db/schema";

export type AnnouncementActionResult = {
  ok: boolean;
  message: string;
  announcementId?: string;
};

export type SaveAnnouncementInput = {
  id?: string;
  title: string;
  body: string;
  startsAt: string;
  expiresAt: string;
  intent: "save_draft" | "publish";
};

const saveSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(3).max(80),
  body: z.string().trim().min(3).max(500),
  startsAt: z.string().refine((value) => Number.isFinite(new Date(value).getTime())),
  expiresAt: z.string(),
  intent: z.enum(["save_draft", "publish"]),
});

function revalidateAnnouncementViews() {
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function saveCommissionerAnnouncement(
  input: SaveAnnouncementInput,
): Promise<AnnouncementActionResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Add a title, message, and valid start time before saving." };
  }

  const startsAt = new Date(parsed.data.startsAt);
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= startsAt)) {
    return { ok: false, message: "The optional end time must be after the start time." };
  }

  const admin = await requireAdminUser();
  const db = getDb();
  const now = new Date();
  const nextStatus = parsed.data.intent === "publish" ? "published" : "draft";

  const result = await db.transaction(async (transaction) => {
    if (nextStatus === "published") {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext('commissioner_announcements_publish'))`,
      );
      const [overlap] = await transaction
        .select({ id: commissionerAnnouncements.id })
        .from(commissionerAnnouncements)
        .where(
          and(
            eq(commissionerAnnouncements.status, "published"),
            parsed.data.id ? ne(commissionerAnnouncements.id, parsed.data.id) : undefined,
            expiresAt ? lt(commissionerAnnouncements.startsAt, expiresAt) : undefined,
            or(
              isNull(commissionerAnnouncements.expiresAt),
              gt(commissionerAnnouncements.expiresAt, startsAt),
            ),
          ),
        )
        .limit(1);
      if (overlap) {
        return {
          ok: false as const,
          message: "Another published announcement overlaps this display window. End or archive it first.",
        };
      }
    }

    if (parsed.data.id) {
      const [existing] = await transaction
        .select({ id: commissionerAnnouncements.id, status: commissionerAnnouncements.status })
        .from(commissionerAnnouncements)
        .where(eq(commissionerAnnouncements.id, parsed.data.id))
        .for("update")
        .limit(1);
      if (!existing) return { ok: false as const, message: "That announcement could not be found." };
      if (existing.status === "archived") {
        return { ok: false as const, message: "Archived announcements cannot be edited." };
      }

      const [updated] = await transaction
        .update(commissionerAnnouncements)
        .set({
          title: parsed.data.title,
          body: parsed.data.body,
          status: nextStatus,
          startsAt,
          expiresAt,
          updatedByUserId: admin.id,
          publishedAt: nextStatus === "published" ? (existing.status === "published" ? undefined : now) : null,
          updatedAt: now,
        })
        .where(and(eq(commissionerAnnouncements.id, existing.id), ne(commissionerAnnouncements.status, "archived")))
        .returning({ id: commissionerAnnouncements.id });
      if (!updated) return { ok: false as const, message: "The announcement changed before it could be saved." };

      await transaction.insert(auditEvents).values({
        actorUserId: admin.id,
        action: nextStatus === "published" ? "commissioner_announcement.published" : "commissioner_announcement.draft_saved",
        entityType: "commissioner_announcement",
        entityId: updated.id,
        metadata: { previous_status: existing.status, next_status: nextStatus, starts_at: startsAt.toISOString(), expires_at: expiresAt?.toISOString() ?? null },
      });
      return { ok: true as const, id: updated.id };
    }

    const [created] = await transaction
      .insert(commissionerAnnouncements)
      .values({
        title: parsed.data.title,
        body: parsed.data.body,
        status: nextStatus,
        startsAt,
        expiresAt,
        createdByUserId: admin.id,
        updatedByUserId: admin.id,
        publishedAt: nextStatus === "published" ? now : null,
      })
      .returning({ id: commissionerAnnouncements.id });

    await transaction.insert(auditEvents).values({
      actorUserId: admin.id,
      action: nextStatus === "published" ? "commissioner_announcement.published" : "commissioner_announcement.draft_saved",
      entityType: "commissioner_announcement",
      entityId: created.id,
      metadata: { previous_status: null, next_status: nextStatus, starts_at: startsAt.toISOString(), expires_at: expiresAt?.toISOString() ?? null },
    });
    return { ok: true as const, id: created.id };
  });

  if (!result.ok) return { ok: false, message: result.message };
  revalidateAnnouncementViews();
  return {
    ok: true,
    announcementId: result.id,
    message: nextStatus === "published"
      ? startsAt > now ? "Announcement scheduled." : "Announcement is live."
      : "Announcement saved as a private draft.",
  };
}

export async function archiveCommissionerAnnouncement(id: string): Promise<AnnouncementActionResult> {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return { ok: false, message: "That announcement was not valid." };

  const admin = await requireAdminUser();
  const db = getDb();
  const now = new Date();
  const result = await db.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ id: commissionerAnnouncements.id, status: commissionerAnnouncements.status })
      .from(commissionerAnnouncements)
      .where(eq(commissionerAnnouncements.id, parsedId.data))
      .for("update")
      .limit(1);
    if (!existing) return { ok: false as const, message: "That announcement could not be found." };
    if (existing.status === "archived") return { ok: true as const, id: existing.id };

    await transaction.update(commissionerAnnouncements).set({
      status: "archived",
      archivedAt: now,
      updatedAt: now,
      updatedByUserId: admin.id,
    }).where(eq(commissionerAnnouncements.id, existing.id));
    await transaction.insert(auditEvents).values({
      actorUserId: admin.id,
      action: "commissioner_announcement.archived",
      entityType: "commissioner_announcement",
      entityId: existing.id,
      metadata: { previous_status: existing.status, next_status: "archived" },
    });
    return { ok: true as const, id: existing.id };
  });

  if (!result.ok) return { ok: false, message: result.message };
  revalidateAnnouncementViews();
  return { ok: true, announcementId: result.id, message: "Announcement removed from player view and archived." };
}
