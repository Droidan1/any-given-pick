"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth/app-user";
import { getDb } from "@/lib/db";
import { auditEvents, emailNotificationPreferences } from "@/lib/db/schema";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export type EmailPreferenceActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function checked(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

export async function saveEmailPreferencesAction(
  _previousState: EmailPreferenceActionState,
  formData: FormData,
): Promise<EmailPreferenceActionState> {
  const appUser = await requireAppUser();
  if (appUser.accountState === "deleted_anonymized") {
    return { status: "error", message: "Email preferences are unavailable for this account." };
  }
  const rateLimit = await consumeRateLimit({
    scope: "email_preferences",
    identifier: appUser.id,
    limit: 30,
    windowMs: 60 * 60 * 1_000,
  });
  if (!rateLimit.allowed) {
    return { status: "error", message: "Too many preference changes. Try again later." };
  }

  const values = {
    weekPublished: checked(formData, "weekPublished"),
    deadlineApproaching: checked(formData, "deadlineApproaching"),
    picksSubmitted: checked(formData, "picksSubmitted"),
    resultsAvailable: checked(formData, "resultsAvailable"),
  };
  const now = new Date();
  await getDb().transaction(async (transaction) => {
    await transaction
      .insert(emailNotificationPreferences)
      .values({ userId: appUser.id, ...values, updatedAt: now })
      .onConflictDoUpdate({
        target: emailNotificationPreferences.userId,
        set: { ...values, updatedAt: now },
      });
    await transaction.insert(auditEvents).values({
      actorUserId: appUser.id,
      targetUserId: appUser.id,
      action: "email_preferences.updated",
      entityType: "email_notification_preferences",
      entityId: appUser.id,
      metadata: values,
    });
  });

  revalidatePath("/profile");
  return { status: "success", message: "Email reminder preferences saved." };
}
