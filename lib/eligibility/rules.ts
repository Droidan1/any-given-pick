import type { AccountSummary, EligibilityReason } from "@/lib/account-types";

export const reasonLabels: Record<EligibilityReason, string> = {
  eligible: "Eligible to participate",
  approval_pending: "Waiting for administrator approval",
  access_removed: "Account access was removed",
  account_inactive: "Account access is restricted",
  auth_unverified: "Verify an email address or Google account",
  profile_incomplete: "Finish your player profile",
  age_ineligible: "Participation is limited to adults 21 and older",
};

export function deriveEligibilityReason(input: {
  accountState: AccountSummary["accountState"];
  stateReason: string | null;
  verifiedAuth: boolean;
  profileComplete: boolean;
  ageEligible: boolean | null;
}): EligibilityReason {
  if (
    input.accountState === "read_only" &&
    input.stateReason === "awaiting_admin_approval"
  ) return "approval_pending";
  if (
    input.accountState === "suspended" &&
    input.stateReason === "removed_by_admin"
  ) return "access_removed";
  if (input.accountState !== "active") return "account_inactive";
  if (!input.verifiedAuth) return "auth_unverified";
  if (!input.profileComplete) return "profile_incomplete";
  if (!input.ageEligible) return "age_ineligible";
  return "eligible";
}
