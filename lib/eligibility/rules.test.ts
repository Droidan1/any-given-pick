import { describe, expect, it } from "vitest";
import { deriveEligibilityReason } from "./rules";

const cleared = {
  accountState: "active" as const,
  stateReason: null,
  verifiedAuth: true,
  profileComplete: true,
  ageEligible: true,
  locationResult: "in_state" as const,
  locationIsFresh: true,
};

describe("participation eligibility", () => {
  it("allows only a cleared active account", () => {
    expect(deriveEligibilityReason(cleared)).toBe("eligible");
  });

  it.each([
    [{ ...cleared, verifiedAuth: false }, "auth_unverified"],
    [{ ...cleared, ageEligible: false }, "age_ineligible"],
    [{ ...cleared, locationResult: "outside_state" as const }, "location_outside_indiana"],
    [{ ...cleared, locationResult: "denied" as const }, "location_denied"],
    [{ ...cleared, locationIsFresh: false }, "location_stale"],
    [{ ...cleared, accountState: "suspended" as const }, "account_inactive"],
    [
      { ...cleared, accountState: "read_only" as const, stateReason: "awaiting_admin_approval" },
      "approval_pending",
    ],
    [
      { ...cleared, accountState: "suspended" as const, stateReason: "removed_by_admin" },
      "access_removed",
    ],
  ])("returns read-only reason %#", (input, expected) => {
    expect(deriveEligibilityReason(input)).toBe(expected);
  });
});
