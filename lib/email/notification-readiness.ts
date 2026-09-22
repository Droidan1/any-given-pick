import "server-only";

import { getDb } from "@/lib/db";
import { emailDeliveries, pushDeliveries, nativePushDeliveries, nativePushDevices } from "@/lib/db/schema";
import { apnsConfigured, nativePushEnabled } from "@/lib/native-push/apns";

export async function inspectNotificationReadiness() {
  const db = getDb();
  // Validate the delivery tables without loading player data or claiming any work.
  await Promise.all([
    db.select().from(emailDeliveries).limit(0),
    db.select().from(pushDeliveries).limit(0),
    db.select().from(nativePushDeliveries).limit(0),
    db.select().from(nativePushDevices).limit(0),
  ]);
  return {
    dryRun: true,
    database: "ready",
    clerkConfigured: Boolean(process.env.CLERK_SECRET_KEY),
    emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    webPushConfigured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    nativePush: {
      enabled: nativePushEnabled(),
      sandboxConfigured: apnsConfigured("sandbox"),
      productionConfigured: apnsConfigured("production"),
    },
    notificationsSent: 0,
  };
}
