"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAppUser } from "@/lib/auth/app-user";
import { getDb } from "@/lib/db";
import { auditEvents, pushDeliveries, pushSubscriptions } from "@/lib/db/schema";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const subscriptionSchema = z.object({
  endpoint: z.url().max(2048).refine((value) => value.startsWith("https://")),
  keys: z.object({
    p256dh: z.string().min(16).max(512),
    auth: z.string().min(8).max(256),
  }),
  userAgent: z.string().max(256).optional(),
});

const endpointSchema = z.url().max(2048).refine((value) => value.startsWith("https://"));

export type PushSubscriptionActionResult = {
  ok: boolean;
  message: string;
};

export async function savePushSubscriptionAction(
  input: unknown,
): Promise<PushSubscriptionActionResult> {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "This browser subscription was not valid." };

  const appUser = await requireAppUser();
  if (appUser.accountState === "deleted_anonymized") {
    return { ok: false, message: "Push notifications are unavailable for this account." };
  }
  const rateLimit = await consumeRateLimit({
    scope: "push_subscription",
    identifier: appUser.id,
    limit: 120,
    windowMs: 60 * 60 * 1_000,
  });
  if (!rateLimit.allowed) {
    return { ok: false, message: "Too many notification changes. Try again later." };
  }

  const now = new Date();
  await getDb().transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ id: pushSubscriptions.id, userId: pushSubscriptions.userId })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, parsed.data.endpoint))
      .for("update")
      .limit(1);
    if (existing && existing.userId !== appUser.id) {
      await transaction
        .delete(pushDeliveries)
        .where(eq(pushDeliveries.subscriptionId, existing.id));
    }
    await transaction
      .insert(pushSubscriptions)
      .values({
        userId: appUser.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: parsed.data.userAgent,
        updatedAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: appUser.id,
          p256dh: parsed.data.keys.p256dh,
          auth: parsed.data.keys.auth,
          userAgent: parsed.data.userAgent,
          updatedAt: now,
          lastSeenAt: now,
        },
      });
    if (!existing || existing.userId !== appUser.id) {
      await transaction.insert(auditEvents).values({
        actorUserId: appUser.id,
        targetUserId: appUser.id,
        action: "push_notifications.enabled",
        entityType: "push_subscription",
        metadata: { channel: "web_push" },
      });
    }
  });
  return { ok: true, message: "Push notifications are on for this device." };
}

export async function removePushSubscriptionAction(
  endpoint: unknown,
): Promise<PushSubscriptionActionResult> {
  const parsed = endpointSchema.safeParse(endpoint);
  if (!parsed.success) return { ok: false, message: "This browser subscription was not valid." };
  const appUser = await requireAppUser();
  const rateLimit = await consumeRateLimit({
    scope: "push_subscription",
    identifier: appUser.id,
    limit: 20,
    windowMs: 60 * 60 * 1_000,
  });
  if (!rateLimit.allowed) {
    return { ok: false, message: "Too many notification changes. Try again later." };
  }

  await getDb().transaction(async (transaction) => {
    await transaction
      .delete(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.userId, appUser.id),
        eq(pushSubscriptions.endpoint, parsed.data),
      ));
    await transaction.insert(auditEvents).values({
      actorUserId: appUser.id,
      targetUserId: appUser.id,
      action: "push_notifications.disabled",
      entityType: "push_subscription",
      metadata: { channel: "web_push" },
    });
  });
  return { ok: true, message: "Push notifications are off for this device." };
}
