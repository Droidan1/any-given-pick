import { describe, expect, it } from "vitest";
import { isAtLeast21, normalizeDisplayName, profileInputSchema } from "./profile-validation";

describe("profile validation", () => {
  it("normalizes display names case-insensitively", () => {
    expect(normalizeDisplayName("  Fourth   & Long  ")).toBe("fourth & long");
  });

  it("accepts the exact 21st birthday and rejects one day younger", () => {
    const participationDate = new Date("2026-09-10T12:00:00.000Z");
    expect(isAtLeast21("2005-09-10", participationDate)).toBe(true);
    expect(isAtLeast21("2005-09-11", participationDate)).toBe(false);
  });

  it("rejects malformed names and impossible dates", () => {
    expect(profileInputSchema.safeParse({ displayName: "!!", birthDate: "2000-02-30" }).success).toBe(false);
  });
});
