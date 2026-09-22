import "server-only";

import { after } from "next/server";
import { processQueuedPlayerEmails, queueAvailableResultsEmails } from "@/lib/email/player-notifications";
import { processQueuedPlayerPushes, queueAvailableResultsPushes } from "@/lib/push/player-notifications";
import { processNativePushes, queueAvailableNativeResults } from "@/lib/native-push/player-notifications";
import { reportOperationalIssue, resolveOperationalIssue } from "@/lib/monitoring/operational-alerts";

/** Only completed weeks qualify; persistent delivery keys deduplicate overlapping jobs. */
export async function deliverAvailableResultsNotifications(now = new Date()) {
  // Await every channel, even when another rejects, before the serverless task finishes.
  const outcomes = await Promise.allSettled([
    queueAvailableResultsEmails(now).then(() => processQueuedPlayerEmails({ now })),
    queueAvailableResultsPushes(now).then(() => processQueuedPlayerPushes({ now })),
    queueAvailableNativeResults(now).then(() => processNativePushes(now)),
  ]);
  const failedChannels = outcomes.filter((result) =>
    result.status === "rejected" || result.value.failed > 0,
  ).length;
  if (failedChannels > 0) {
    await reportOperationalIssue({
      kind: "player_notification_queue",
      identity: "results_available",
      severity: "warning",
      message: "A results notification could not be queued or processed. The scheduled job will retry.",
      context: { failed_channels: failedChannels },
      now,
    });
  } else {
    await resolveOperationalIssue("player_notification_queue", "results_available");
  }
}

export function scheduleResultsNotifications(now = new Date()): void {
  try {
    after(async () => {
      try {
        await deliverAvailableResultsNotifications(now);
      } catch {
        // Notifications must never turn a successful score update into a failed sync.
        console.error("Results notification task failed; scheduled recovery remains enabled.");
      }
    });
  } catch {
    // A caller outside a Next request cannot use after(); the hourly job is the backstop.
    console.error("Results notification task could not be scheduled; scheduled recovery remains enabled.");
  }
}
