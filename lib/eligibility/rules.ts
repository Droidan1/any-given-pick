import type { AccountSummary, EligibilityReason } from "@/lib/account-types";

export const reasonLabels: Record<EligibilityReason, string> = {
  eligible: "Eligible to participate",
  approval_pending: "Waiting for administrator approval",
  access_removed: "Account access was removed",
  account_inactive: "Account access is restricted",
  auth_unverified: "Verify an email address or Google account",
  profile_incomplete: "Finish your player profile",
  age_ineligible: "Participation is limited to adults 21 and older",
  location_required: "Verify your Indiana location for this session",
  location_outside_indiana: "Outside Indiana — read-only access",
  location_denied: "Location permission was denied — read-only access",
  location_unavailable: "Location is unavailable — read-only access",
  location_indeterminate: "Indiana location could not be confirmed",
  location_stale: "Location verification expired",
};

export function deriveEligibilityReason(input: {
  accountState: AccountSummary["accountState"];
  stateReason: string | null;
  verifiedAuth: boolean;
  profileComplete: boolean;
  ageEligible: boolean | null;
  locationResult: AccountSummary["locationResult"];
  locationIsFresh: boolean;
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
  if (!input.locationResult) return "location_required";
  if (!input.locationIsFresh) return "location_stale";
  if (input.locationResult === "outside_state") return "location_outside_indiana";
  if (input.locationResult === "denied") return "location_denied";
  if (input.locationResult === "unavailable") return "location_unavailable";
  if (input.locationResult === "indeterminate") return "location_indeterminate";
  return "eligible";
}
