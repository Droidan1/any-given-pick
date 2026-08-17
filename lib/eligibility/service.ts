import "server-only";

import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { AccountSummary } from "@/lib/account-types";
import { getDb } from "@/lib/db";
import { authIdentities, eligibilityChecks, profiles, users } from "@/lib/db/schema";
import { deriveEligibilityReason, reasonLabels } from "@/lib/eligibility/rules";

export async function getAccountSummary(userId: string): Promise<AccountSummary> {
  const db = getDb();
  const now = new Date();

  const [accountRows, verifiedRows, locationRows] = await Promise.all([
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
    db
      .select({
        locationResult: eligibilityChecks.locationResult,
        checkedAt: eligibilityChecks.checkedAt,
        expiresAt: eligibilityChecks.expiresAt,
      })
      .from(eligibilityChecks)
      .where(eq(eligibilityChecks.userId, userId))
      .orderBy(desc(eligibilityChecks.checkedAt))
      .limit(1),
  ]);

  const account = accountRows[0];
  if (!account) throw new Error("APP_USER_NOT_FOUND");

  const location = locationRows[0] ?? null;
  const profileComplete = Boolean(account.displayName && account.ageEligible !== null);
  const verifiedAuth = verifiedRows.length > 0;
  const locationIsFresh = Boolean(location && location.expiresAt > now);
  const reason = deriveEligibilityReason({
    accountState: account.accountState,
    stateReason: account.stateReason,
    verifiedAuth,
    profileComplete,
    ageEligible: account.ageEligible,
    locationResult: location?.locationResult ?? null,
    locationIsFresh,
  });

  return {
    signedIn: true,
    displayName: account.displayName,
    accountState: account.accountState,
    stateReason: account.stateReason,
    verifiedAuth,
    ageEligible: account.ageEligible,
    locationResult: location?.locationResult ?? null,
    overallResult: reason === "eligible" ? "eligible" : "read_only",
    reason,
    reasonLabel: reasonLabels[reason],
    locationCheckedAt: location?.checkedAt.toISOString() ?? null,
    locationExpiresAt: location?.expiresAt.toISOString() ?? null,
    locationFresh: locationIsFresh,
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
