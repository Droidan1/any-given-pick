import "server-only";

import { createHash } from "node:crypto";
import { auth, currentUser } from "@clerk/nextjs/server";
import type { User } from "@clerk/nextjs/server";
import { and, eq, lt } from "drizzle-orm";
import { after } from "next/server";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { authIdentities, roles, userRoles, users } from "@/lib/db/schema";
import { getAccountSummary } from "@/lib/eligibility/service";
import { getNewUserAccessDefaults } from "@/lib/auth/user-approval";
import { queueAndProcessAdminApprovalNeededEmail } from "@/lib/email/account-lifecycle-notifications";
import { reportOperationalIssue } from "@/lib/monitoring/operational-alerts";

export type AppUser = typeof users.$inferSelect;

const LAST_SEEN_WRITE_INTERVAL_MS = 15 * 60 * 1_000;

type IdentitySnapshot = {
  provider: string;
  providerUserId: string;
  identifierHash: string;
  verifiedAt: Date | null;
};

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLocaleLowerCase("en-US")).digest("hex");
}

function identitySnapshots(clerkUser: User): IdentitySnapshot[] {
  const now = new Date();
  const emailIdentities = clerkUser.emailAddresses.map((email) => ({
    provider: "email",
    providerUserId: email.id,
    identifierHash: hashIdentifier(email.emailAddress),
    verifiedAt: email.verification?.status === "verified" ? now : null,
  }));

  const socialIdentities = clerkUser.externalAccounts.map((account) => ({
    provider: account.provider,
    providerUserId: account.providerUserId,
    identifierHash: hashIdentifier(account.emailAddress || account.providerUserId),
    verifiedAt: account.verification?.status === "verified" ? now : null,
  }));

  return [...emailIdentities, ...socialIdentities];
}

async function syncClerkUser(clerkUser: User): Promise<AppUser> {
  const db = getDb();
  const now = new Date();
  const accessDefaults = getNewUserAccessDefaults();

  const result = await db.transaction(async (transaction) => {
    const [insertedUser] = await transaction
      .insert(users)
      .values({
        clerkUserId: clerkUser.id,
        ...accessDefaults,
        stateChangedAt: now,
        lastSeenAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: users.clerkUserId })
      .returning();

    const [appUser] = insertedUser
      ? [insertedUser]
      : await transaction
          .update(users)
          .set({ lastSeenAt: now, updatedAt: now })
          .where(eq(users.clerkUserId, clerkUser.id))
          .returning();
    if (!appUser) throw new Error("APP_USER_SYNC_FAILED");

    for (const identity of identitySnapshots(clerkUser)) {
      await transaction
        .insert(authIdentities)
        .values({ userId: appUser.id, ...identity, lastSeenAt: now })
        .onConflictDoUpdate({
          target: [authIdentities.provider, authIdentities.providerUserId],
          set: {
            userId: appUser.id,
            identifierHash: identity.identifierHash,
            verifiedAt: identity.verifiedAt,
            lastSeenAt: now,
          },
        });
    }

    await transaction
      .insert(roles)
      .values({ key: "user", description: "Standard contest participant" })
      .onConflictDoNothing({ target: roles.key });

    const [participantRole] = await transaction
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, "user"))
      .limit(1);

    if (participantRole) {
      await transaction
        .insert(userRoles)
        .values({ userId: appUser.id, roleId: participantRole.id })
        .onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] });
    }

    return { appUser, isNew: Boolean(insertedUser) };
  });

  if (
    result.isNew
    && result.appUser.accountState === "read_only"
    && result.appUser.stateReason === "awaiting_admin_approval"
  ) {
    after(async () => {
      try {
        await queueAndProcessAdminApprovalNeededEmail(result.appUser.id);
      } catch {
        await reportOperationalIssue({
          kind: "account_email_queue",
          identity: `approval-needed:${result.appUser.id}`,
          severity: "warning",
          message: "A new player approval email could not be queued immediately.",
          context: { stage: "new_user" },
        });
      }
    });
  }

  return result.appUser;
}

const getStoredAppUser = cache(async (clerkUserId: string): Promise<AppUser | null> => {
  const db = getDb();
  const [appUser] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  return appUser ?? null;
});

function touchLastSeen(appUser: AppUser): void {
  const staleBefore = new Date(Date.now() - LAST_SEEN_WRITE_INTERVAL_MS);
  if (appUser.lastSeenAt >= staleBefore) return;

  after(async () => {
    try {
      await getDb()
        .update(users)
        .set({ lastSeenAt: new Date() })
        .where(and(eq(users.id, appUser.id), lt(users.lastSeenAt, staleBefore)));
    } catch {
      // A last-seen timestamp is useful telemetry, never a reason to fail a request.
    }
  });
}

async function getOrCreateAppUser(clerkUserId: string): Promise<AppUser> {
  const stored = await getStoredAppUser(clerkUserId);
  if (stored) {
    touchLastSeen(stored);
    return stored;
  }

  const clerkUser = await currentUser();
  if (!clerkUser || clerkUser.id !== clerkUserId) throw new Error("AUTH_REQUIRED");
  return syncClerkUser(clerkUser);
}

export async function requireAppUser(knownClerkUserId?: string): Promise<AppUser> {
  const userId = knownClerkUserId ?? (await auth()).userId;
  if (!userId) throw new Error("AUTH_REQUIRED");
  return getOrCreateAppUser(userId);
}

export async function getOptionalAccountSummary() {
  const { userId } = await auth();
  if (!userId) return null;

  const appUser = await getOrCreateAppUser(userId);
  return getAccountSummary(appUser.id);
}
