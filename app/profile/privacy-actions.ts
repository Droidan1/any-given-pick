"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppUser } from "@/lib/auth/app-user";
import { getDb } from "@/lib/db";
import { auditEvents, privacyRequests, users } from "@/lib/db/schema";
import { sendSystemEmail } from "@/lib/email/system-email";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export type PrivacyActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const confirmationSchema = z.object({
  confirmation: z.string().trim().transform((value) => value.toLocaleUpperCase("en-US")),
});

export async function requestAccountDeletionAction(
  _previousState: PrivacyActionState,
  formData: FormData,
): Promise<PrivacyActionState> {
  const parsed = confirmationSchema.safeParse({ confirmation: formData.get("confirmation") });
  if (!parsed.success || parsed.data.confirmation !== "DELETE") {
    return { status: "error", message: "Type DELETE to confirm this request." };
  }

  const appUser = await requireAppUser();
  if (appUser.stateReason === "deletion_requested") {
    return {
      status: "error",
      message: "Your deletion request is already pending.",
    };
  }
  const rateLimit = await consumeRateLimit({
    scope: "privacy_request",
    identifier: appUser.id,
    limit: 3,
    windowMs: 60 * 60 * 1_000,
  });
  if (!rateLimit.allowed) {
    return { status: "error", message: "Too many privacy requests. Try again later." };
  }

  const now = new Date();
  const db = getDb();
  const result = await db.transaction(async (transaction) => {
    const [account] = await transaction
      .select({ accountState: users.accountState, stateReason: users.stateReason })
      .from(users)
      .where(eq(users.id, appUser.id))
      .for("update")
      .limit(1);
    if (!account || account.accountState === "deleted_anonymized") return null;

    const [existing] = await transaction
      .select({ id: privacyRequests.id })
      .from(privacyRequests)
      .where(and(eq(privacyRequests.userId, appUser.id), eq(privacyRequests.status, "pending")))
      .limit(1);
    if (existing) return existing.id;

    const [request] = await transaction
      .insert(privacyRequests)
      .values({
        userId: appUser.id,
        previousAccountState: account.accountState,
        previousStateReason: account.stateReason,
        requestedAt: now,
        updatedAt: now,
      })
      .returning({ id: privacyRequests.id });
    if (!request) return null;

    await transaction
      .update(users)
      .set({
        accountState: "read_only",
        stateReason: "deletion_requested",
        stateChangedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, appUser.id));

    await transaction.insert(auditEvents).values({
      actorUserId: appUser.id,
      targetUserId: appUser.id,
      action: "privacy.deletion_requested",
      entityType: "privacy_request",
      entityId: request.id,
      metadata: { next_account_state: "read_only" },
    });
    return request.id;
  });

  if (!result) {
    return { status: "error", message: "The request could not be created. Refresh and try again." };
  }

  await sendSystemEmail({
    subject: "[Any Given Pick] Account deletion request",
    text: [
      "An authenticated player requested account deletion and anonymization.",
      "",
      `Request ID: ${result}`,
      `Requested: ${now.toISOString()}`,
      "",
      "Review and complete this request from the protected Admin settings page. Identity details were intentionally omitted from this email.",
    ].join("\n"),
    idempotencyKey: `privacy-request-${result}`,
  });

  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/admin");
  return {
    status: "success",
    message: "Deletion requested. Your account is read-only while an administrator completes anonymization.",
  };
}

export async function cancelAccountDeletionAction(
  _previousState: PrivacyActionState,
  _formData: FormData,
): Promise<PrivacyActionState> {
  void _previousState;
  void _formData;
  const appUser = await requireAppUser();
  const now = new Date();
  const canceled = await getDb().transaction(async (transaction) => {
    const [request] = await transaction
      .select({
        id: privacyRequests.id,
        previousAccountState: privacyRequests.previousAccountState,
        previousStateReason: privacyRequests.previousStateReason,
      })
      .from(privacyRequests)
      .where(and(
        eq(privacyRequests.userId, appUser.id),
        eq(privacyRequests.status, "pending"),
        isNull(privacyRequests.processingAt),
      ))
      .for("update")
      .limit(1);
    if (!request) return false;

    await transaction
      .update(privacyRequests)
      .set({ status: "canceled", canceledAt: now, updatedAt: now })
      .where(eq(privacyRequests.id, request.id));
    await transaction
      .update(users)
      .set({
        accountState: request.previousAccountState,
        stateReason: request.previousStateReason,
        stateChangedAt: now,
        updatedAt: now,
      })
      .where(and(eq(users.id, appUser.id), eq(users.stateReason, "deletion_requested")));
    await transaction.insert(auditEvents).values({
      actorUserId: appUser.id,
      targetUserId: appUser.id,
      action: "privacy.deletion_canceled",
      entityType: "privacy_request",
      entityId: request.id,
      metadata: { restored_account_state: request.previousAccountState },
    });
    return true;
  });

  if (!canceled) return { status: "error", message: "No pending deletion request was found." };
  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/admin");
  return { status: "success", message: "Deletion request canceled. Your previous account access state was restored." };
}
