import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";
import type { AccountSummary } from "@/lib/account-types";
import { getDb } from "@/lib/db";
import { authIdentities, profiles, users } from "@/lib/db/schema";
import { deriveEligibilityReason, reasonLabels } from "@/lib/eligibility/rules";

export async function getAccountSummary(userId: string): Promise<AccountSummary> {
  const db = getDb();
  const [accountRows, verifiedRows] = await Promise.all([
    db
      .select({
        accountState: users.accountState,
        stateReason: users.stateReason,
        displayName: profiles.displayName,
        ageEligible: profiles.ageEligible,
      })
      .from(users)
      .leftJoin(profiles, eq(users.id, profiles.userId))
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ id: authIdentities.id })
      .from(authIdentities)
      .where(and(eq(authIdentities.userId, userId), isNotNull(authIdentities.verifiedAt)))
      .limit(1),
  ]);

  const account = accountRows[0];
  if (!account) throw new Error("APP_USER_NOT_FOUND");

  const profileComplete = Boolean(account.displayName && account.ageEligible !== null);
  const verifiedAuth = verifiedRows.length > 0;
  const reason = deriveEligibilityReason({
    accountState: account.accountState,
    stateReason: account.stateReason,
    verifiedAuth,
    profileComplete,
    ageEligible: account.ageEligible,
  });

  return {
    signedIn: true,
    displayName: account.displayName,
    accountState: account.accountState,
    stateReason: account.stateReason,
    verifiedAuth,
    ageEligible: account.ageEligible,
    overallResult: reason === "eligible" ? "eligible" : "read_only",
    reason,
    reasonLabel: reasonLabels[reason],
    profileComplete,
  };
}

export async function getProfileRecord(userId: string) {
  const db = getDb();
  const [profile] = await db
    .select({
      displayName: profiles.displayName,
      birthDate: profiles.birthDate,
      displayNameChangedAt: profiles.displayNameChangedAt,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (!profile) return null;

  return {
    ...profile,
    displayNameChangedAt: profile.displayNameChangedAt.toISOString(),
  };
}
