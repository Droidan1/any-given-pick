import { describe, expect, it } from "vitest";
import { shouldRefreshUpcomingOdds } from "./odds-refresh";

const now = new Date("2026-08-24T16:00:00.000Z");

describe("upcoming odds refresh", () => {
  it("does not request a provider check without games", () => {
    expect(shouldRefreshUpcomingOdds([], now)).toBe(false);
  });

  it("requests a provider check when the slate has no stored odds", () => {
    expect(shouldRefreshUpcomingOdds([{ odds: null }], now)).toBe(true);
  });

  it("keeps recently refreshed odds without another check", () => {
    expect(shouldRefreshUpcomingOdds([
      { odds: { updatedAt: "2026-08-24T15:00:00.000Z" } },
      { odds: null },
    ], now)).toBe(false);
  });

  it("refreshes odds after two hours", () => {
    expect(shouldRefreshUpcomingOdds([
      { odds: { updatedAt: "2026-08-24T14:00:00.000Z" } },
    ], now)).toBe(true);
  });
});
