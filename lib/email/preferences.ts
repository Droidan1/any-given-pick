import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailNotificationPreferences } from "@/lib/db/schema";

export type EmailNotificationPreferenceValues = {
  weekPublished: boolean;
  deadlineApproaching: boolean;
  picksSubmitted: boolean;
  resultsAvailable: boolean;
};

export const DEFAULT_EMAIL_NOTIFICATION_PREFERENCES: EmailNotificationPreferenceValues = {
  weekPublished: true,
  deadlineApproaching: true,
  picksSubmitted: true,
  resultsAvailable: true,
};

export async function getEmailNotificationPreferences(
  userId: string,
): Promise<EmailNotificationPreferenceValues> {
  const [preferences] = await getDb()
    .select({
      weekPublished: emailNotificationPreferences.weekPublished,
      deadlineApproaching: emailNotificationPreferences.deadlineApproaching,
      picksSubmitted: emailNotificationPreferences.picksSubmitted,
      resultsAvailable: emailNotificationPreferences.resultsAvailable,
    })
    .from(emailNotificationPreferences)
    .where(eq(emailNotificationPreferences.userId, userId))
    .limit(1);
  return preferences ?? DEFAULT_EMAIL_NOTIFICATION_PREFERENCES;
}
