import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { and, asc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailDeliveries, profiles, users } from "@/lib/db/schema";
import { reportOperationalIssue } from "@/lib/monitoring/operational-alerts";
import {
  buildAccountLifecycleEmail,
  type AccountLifecycleEmailKind,
} from "./account-lifecycle-email";
import { emailRetryDelayMs } from "./player-notification-policy";
import { sendEmail, supportEmailAddress } from "./system-email";

const ACCOUNT_EMAIL_KINDS: AccountLifecycleEmailKind[] = [
  "admin_approval_needed",
  "account_approved",
];
const MAX_ATTEMPTS = 5;
const CLAIM_TIMEOUT_MS = 15 * 60 * 1_000;

type DeliveryRow = typeof emailDeliveries.$inferSelect;

export type AccountLifecycleEmailCycleSummary = {
  queued: number;
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
};

async function insertDelivery(input: {
  userId: string;
  kind: AccountLifecycleEmailKind;
  dedupeKey: string;
}): Promise<number> {
  const inserted = await getDb()
    .insert(emailDeliveries)
    .values(input)
    .onConflictDoNothing({ target: emailDeliveries.dedupeKey })
    .returning({ id: emailDeliveries.id });
  return inserted.length;
}

export async function queueAdminApprovalNeededEmail(userId: string): Promise<number> {
  return insertDelivery({
    userId,
    kind: "admin_approval_needed",
    dedupeKey: `admin_approval_needed:${userId}`,
  });
}

export async function queueAccountApprovedEmail(input: {
  userId: string;
  approvalEventId: string;
}): Promise<number> {
  return insertDelivery({
    userId: input.userId,
    kind: "account_approved",
    dedupeKey: `account_approved:${input.userId}:${input.approvalEventId}`,
  });
}

async function queuePendingApprovalBackfill(): Promise<number> {
  const pendingUsers = await getDb()
    .select({ userId: users.id })
    .from(users)
    .where(and(
      eq(users.accountState, "read_only"),
      eq(users.stateReason, "awaiting_admin_approval"),
    ));
  if (pendingUsers.length === 0) return 0;

  const inserted = await getDb()
    .insert(emailDeliveries)
    .values(pendingUsers.map(({ userId }) => ({
      userId,
      kind: "admin_approval_needed",
      dedupeKey: `admin_approval_needed:${userId}`,
    })))
    .onConflictDoNothing({ target: emailDeliveries.dedupeKey })
    .returning({ id: emailDeliveries.id });
  return inserted.length;
}

async function claimDeliveries(limit: number, now: Date): Promise<DeliveryRow[]> {
  return getDb().transaction(async (transaction) => {
    const candidates = await transaction
      .select()
      .from(emailDeliveries)
      .where(and(
        inArray(emailDeliveries.kind, ACCOUNT_EMAIL_KINDS),
        lt(emailDeliveries.attemptCount, MAX_ATTEMPTS),
        lte(emailDeliveries.nextAttemptAt, now),
        or(
          eq(emailDeliveries.status, "pending"),
          eq(emailDeliveries.status, "failed"),
          and(
            eq(emailDeliveries.status, "processing"),
            lt(emailDeliveries.lastAttemptAt, new Date(now.getTime() - CLAIM_TIMEOUT_MS)),
          ),
        ),
      ))
      .orderBy(asc(emailDeliveries.createdAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (candidates.length === 0) return [];

    const ids = candidates.map((delivery) => delivery.id);
    await transaction
      .update(emailDeliveries)
      .set({
        status: "processing",
        attemptCount: sql`${emailDeliveries.attemptCount} + 1`,
        lastAttemptAt: now,
        updatedAt: now,
      })
      .where(inArray(emailDeliveries.id, ids));

    return candidates.map((delivery) => ({
      ...delivery,
      status: "processing",
      attemptCount: delivery.attemptCount + 1,
      lastAttemptAt: now,
      updatedAt: now,
    }));
  });
}

async function identityDirectory(clerkUserIds: string[]) {
  const directory = new Map<string, { email: string | null; name: string | null }>();
  const clerk = await clerkClient();
  for (let index = 0; index < clerkUserIds.length; index += 100) {
    const batch = clerkUserIds.slice(index, index + 100);
    const { data } = await clerk.users.getUserList({ userId: batch, limit: batch.length });
    for (const user of data) {
      const primary = user.emailAddresses.find(
        (email) => email.id === user.primaryEmailAddressId,
      );
      const verified = primary?.verification?.status === "verified"
        ? primary
        : user.emailAddresses.find((email) => email.verification?.status === "verified");
      directory.set(user.id, {
        email: verified?.emailAddress ?? null,
        name: user.fullName,
      });
    }
  }
  return directory;
}

async function markDirectoryFailure(deliveries: DeliveryRow[], now: Date) {
  await Promise.all(deliveries.map((delivery) => getDb()
    .update(emailDeliveries)
    .set({
      status: "failed",
      nextAttemptAt: new Date(now.getTime() + emailRetryDelayMs(delivery.attemptCount)),
      lastError: "The verified identity directory was temporarily unavailable.",
      updatedAt: now,
    })
    .where(eq(emailDeliveries.id, delivery.id))));
}

export async function processQueuedAccountLifecycleEmails(input?: {
  limit?: number;
  now?: Date;
}): Promise<Omit<AccountLifecycleEmailCycleSummary, "queued">> {
  const now = input?.now ?? new Date();
  const claimed = await claimDeliveries(Math.min(input?.limit ?? 10, 25), now);
  const summary = { claimed: claimed.length, sent: 0, failed: 0, skipped: 0 };
  if (claimed.length === 0) return summary;

  const userIds = [...new Set(claimed.map((delivery) => delivery.userId))];
  const userRows = await getDb()
    .select({
      id: users.id,
      clerkUserId: users.clerkUserId,
      accountState: users.accountState,
      stateReason: users.stateReason,
      displayName: profiles.displayName,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(inArray(users.id, userIds));
  const usersById = new Map(userRows.map((user) => [user.id, user]));

  let identities: Awaited<ReturnType<typeof identityDirectory>>;
  try {
    identities = await identityDirectory(userRows.map((user) => user.clerkUserId));
  } catch {
    await markDirectoryFailure(claimed, now);
    await reportOperationalIssue({
      kind: "account_email_delivery",
      identity: "clerk_directory",
      severity: "warning",
      message: "Account status emails are waiting because the identity directory was unavailable.",
      context: { failed_count: claimed.length },
      now,
    });
    return { ...summary, failed: claimed.length };
  }

  for (const delivery of claimed) {
    const kind = delivery.kind as AccountLifecycleEmailKind;
    const user = usersById.get(delivery.userId);
    const identity = user ? identities.get(user.clerkUserId) : null;
    const stillApplies = kind === "admin_approval_needed"
      ? user?.accountState === "read_only" && user.stateReason === "awaiting_admin_approval"
      : user?.accountState === "active";
    const recipient = kind === "admin_approval_needed"
      ? supportEmailAddress()
      : identity?.email ?? null;

    if (!user || !stillApplies || !recipient) {
      await getDb()
        .update(emailDeliveries)
        .set({
          status: "skipped",
          lastError: !recipient
            ? "No verified recipient email was available."
            : "Delivery no longer applies.",
          updatedAt: now,
        })
        .where(eq(emailDeliveries.id, delivery.id));
      summary.skipped += 1;
      continue;
    }

    const content = buildAccountLifecycleEmail({
      kind,
      displayName: user.displayName || identity?.name || null,
      verifiedEmail: identity?.email ?? null,
      occurredAt: delivery.createdAt,
    });
    const result = await sendEmail({
      to: recipient,
      subject: content.subject,
      text: content.text,
      html: content.html,
      idempotencyKey: delivery.dedupeKey,
    });

    if (result.sent) {
      await getDb()
        .update(emailDeliveries)
        .set({
          status: "sent",
          sentAt: now,
          providerMessageId: result.id,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(emailDeliveries.id, delivery.id));
      summary.sent += 1;
    } else {
      await getDb()
        .update(emailDeliveries)
        .set({
          status: "failed",
          nextAttemptAt: new Date(now.getTime() + emailRetryDelayMs(delivery.attemptCount)),
          lastError: result.reason === "not_configured"
            ? "Email delivery is not configured."
            : "The email provider rejected or could not deliver the request.",
          updatedAt: now,
        })
        .where(eq(emailDeliveries.id, delivery.id));
      summary.failed += 1;
    }
  }

  if (summary.failed > 0) {
    await reportOperationalIssue({
      kind: "account_email_delivery",
      identity: "resend",
      severity: "warning",
      message: "One or more account status emails could not be delivered.",
      context: { failed_count: summary.failed, claimed_count: summary.claimed },
      now,
    });
  }
  return summary;
}

export async function runAccountLifecycleEmailCycle(
  now = new Date(),
): Promise<AccountLifecycleEmailCycleSummary> {
  const queued = await queuePendingApprovalBackfill();
  const processed = await processQueuedAccountLifecycleEmails({ now });
  return { queued, ...processed };
}

export async function queueAndProcessAdminApprovalNeededEmail(userId: string) {
  const queued = await queueAdminApprovalNeededEmail(userId);
  const processed = await processQueuedAccountLifecycleEmails();
  return { queued, ...processed };
}

export async function queueAndProcessAccountApprovedEmail(input: {
  userId: string;
  approvalEventId: string;
}) {
  const queued = await queueAccountApprovedEmail(input);
  const processed = await processQueuedAccountLifecycleEmails();
  return { queued, ...processed };
}
