import "server-only";

import { runAccountLifecycleEmailCycle } from "./account-lifecycle-notifications";
import { runPlayerEmailCycle } from "./player-notifications";

export async function runEmailNotificationCycle(now = new Date()) {
  const [player, account] = await Promise.all([
    runPlayerEmailCycle(now),
    runAccountLifecycleEmailCycle(now),
  ]);

  return {
    queued: player.queued + account.queued,
    claimed: player.claimed + account.claimed,
    sent: player.sent + account.sent,
    failed: player.failed + account.failed,
    skipped: player.skipped + account.skipped,
    player,
    account,
  };
}
