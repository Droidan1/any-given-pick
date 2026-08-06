import "server-only";

import { createHash } from "node:crypto";
import { auth, currentUser } from "@clerk/nextjs/server";
import type { User } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { authIdentities, roles, userRoles, users } from "@/lib/db/schema";
import { getAccountSummary } from "@/lib/eligibility/service";

export type AppUser = typeof users.$inferSelect;

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

  return db.transaction(async (transaction) => {
    const [appUser] = await transaction
      .insert(users)
      .values({ clerkUserId: clerkUser.id, lastSeenAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: users.clerkUserId,
        set: { lastSeenAt: now, updatedAt: now },
      })
      .returning();

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

    return appUser;
  });
}

export async function requireAppUser(): Promise<AppUser> {
  const { userId } = await auth();
  if (!userId) throw new Error("AUTH_REQUIRED");

  const clerkUser = await currentUser();
  if (!clerkUser || clerkUser.id !== userId) throw new Error("AUTH_REQUIRED");

  return syncClerkUser(clerkUser);
}

export async function getOptionalAccountSummary() {
  const { userId } = await auth();
  if (!userId) return null;

  const clerkUser = await currentUser();
  if (!clerkUser || clerkUser.id !== userId) return null;

  const appUser = await syncClerkUser(clerkUser);
  return getAccountSummary(appUser.id);
}
