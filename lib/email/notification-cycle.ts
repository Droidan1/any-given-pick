import "server-only";

import { runAccountLifecycleEmailCycle } from "./account-lifecycle-notifications";
import { runPlayerEmailCycle } from "./player-notifications";
import { runPlayerPushCycle } from "@/lib/push/player-notifications";
import { runNativePushCycle } from "@/lib/native-push/player-notifications";

export async function runEmailNotificationCycle(now = new Date()) {
  const [player, account, push, nativePush] = await Promise.all([
    runPlayerEmailCycle(now),
    runAccountLifecycleEmailCycle(now),
    runPlayerPushCycle(now),
    runNativePushCycle(now),
  ]);

  return {
    queued: player.queued + account.queued + push.queued + nativePush.queued,
    claimed: player.claimed + account.claimed + push.claimed + nativePush.claimed,
    sent: player.sent + account.sent + push.sent + nativePush.sent,
    failed: player.failed + account.failed + push.failed + nativePush.failed,
    skipped: player.skipped + account.skipped + push.skipped + nativePush.skipped,
    player,
    account,
    push,
    nativePush,
  };
}
