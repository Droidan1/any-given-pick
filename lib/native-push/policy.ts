import { z } from "zod";
import type { PlayerPushKind } from "../push/player-push-template";
import { areResultsAvailable } from "../email/player-notification-policy";

export const nativePushPreferencesSchema = z.object({
  enabled: z.boolean(),
  weekPublished: z.boolean(),
  deadlineApproaching: z.boolean(),
  picksSubmitted: z.boolean(),
  resultsAvailable: z.boolean(),
}).strict();
export type NativePushPreferences = z.infer<typeof nativePushPreferencesSchema>;
export const defaultNativePushPreferences: NativePushPreferences = {
  enabled: true, weekPublished: true, deadlineApproaching: true,
  picksSubmitted: true, resultsAvailable: true,
};
export const deviceRegistrationSchema = z.object({
  installationId: z.uuid(),
  deviceToken: z.string().regex(/^[a-fA-F0-9]{64,200}$/).refine((value) => value.length % 2 === 0).transform((value) => value.toLowerCase()),
  environment: z.enum(["sandbox", "production"]),
  preferences: nativePushPreferencesSchema,
}).strict();
export const deviceRemovalSchema = z.object({ installationId: z.uuid() }).strict();

export const preferenceForKind = {
  week_published: "weekPublished",
  deadline_approaching: "deadlineApproaching",
  picks_submitted: "picksSubmitted",
  results_available: "resultsAvailable",
} as const;

// Rechecked immediately before sending, not only when an event is queued.
export function nativeDeliveryApplies(input: {
  kind: PlayerPushKind;
  preferences: NativePushPreferences;
  accountState: string;
  weekStatus: string;
  deadline: Date;
  now: Date;
  versionNumber: number;
  hasDeliveryVersion: boolean;
  gameStatuses: Array<"scheduled" | "in_progress" | "final" | "postponed" | "canceled">;
}): boolean {
  if (input.accountState !== "active" || !input.preferences.enabled
    || !input.preferences[preferenceForKind[input.kind]] || input.weekStatus === "draft") return false;
  if (input.kind === "week_published" || input.kind === "deadline_approaching") {
    return input.weekStatus === "published" && input.deadline > input.now
      && (input.kind !== "deadline_approaching" || input.versionNumber === 0);
  }
  if (input.kind === "picks_submitted") return input.hasDeliveryVersion;
  return input.versionNumber > 0 && input.deadline <= input.now && areResultsAvailable(input.gameStatuses);
}

export function nativePushPayload(input: {
  title: string; body: string; kind: PlayerPushKind; weekId: string; userId: string;
}) {
  return {
    aps: { alert: { title: input.title, body: input.body }, sound: "default", "thread-id": input.weekId },
    kind: input.kind, weekId: input.weekId, userId: input.userId,
  };
}

export function classifyAPNsFailure(status: number, reason: string) {
  if (status === 410 || (status === 400 && ["BadDeviceToken", "DeviceTokenNotForTopic"].includes(reason))) {
    return "invalid_device" as const;
  }
  return status === 429 || status >= 500 || status === 403 ? "retry" as const : "permanent" as const;
}
