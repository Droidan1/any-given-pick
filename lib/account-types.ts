export type EligibilityReason =
  | "eligible"
  | "approval_pending"
  | "access_removed"
  | "account_inactive"
  | "auth_unverified"
  | "profile_incomplete"
  | "age_ineligible";

export type AccountSummary = {
  signedIn: true;
  displayName: string | null;
  accountState: "active" | "read_only" | "suspended" | "banned" | "deleted_anonymized";
  stateReason: string | null;
  verifiedAuth: boolean;
  ageEligible: boolean | null;
  overallResult: "eligible" | "read_only";
  reason: EligibilityReason;
  reasonLabel: string;
  profileComplete: boolean;
};
