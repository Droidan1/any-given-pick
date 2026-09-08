import "server-only";

import { runAccountLifecycleEmailCycle } from "./account-lifecycle-notifications";
import { runPlayerEmailCycle } from "./player-notifications";
import { runPlayerPushCycle } from "@/lib/push/player-notifications";

export async function runEmailNotificationCycle(now = new Date()) {
  const [player, account, push] = await Promise.all([
    runPlayerEmailCycle(now),
    runAccountLifecycleEmailCycle(now),
    runPlayerPushCycle(now),
  ]);

  return {
    queued: player.queued + account.queued + push.queued,
    claimed: player.claimed + account.claimed + push.claimed,
    sent: player.sent + account.sent + push.sent,
    failed: player.failed + account.failed + push.failed,
    skipped: player.skipped + account.skipped + push.skipped,
    player,
    account,
    push,
  };
}
