export type EligibilityReason =
  | "eligible"
  | "approval_pending"
  | "access_removed"
  | "account_inactive"
  | "auth_unverified"
  | "profile_incomplete"
  | "age_ineligible"
  | "location_required"
  | "location_outside_indiana"
  | "location_denied"
  | "location_unavailable"
  | "location_indeterminate"
  | "location_stale";

export type AccountSummary = {
  signedIn: true;
  displayName: string | null;
  accountState: "active" | "read_only" | "suspended" | "banned" | "deleted_anonymized";
  stateReason: string | null;
  verifiedAuth: boolean;
  ageEligible: boolean | null;
  locationResult:
    | "in_state"
    | "outside_state"
    | "denied"
    | "unavailable"
    | "indeterminate"
    | null;
  overallResult: "eligible" | "read_only";
  reason: EligibilityReason;
  reasonLabel: string;
  locationCheckedAt: string | null;
  locationExpiresAt: string | null;
  locationFresh: boolean;
  profileComplete: boolean;
};
