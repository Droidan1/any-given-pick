import { describe, expect, it } from "vitest";
import { isScoreSyncReady, scoreSyncFreshnessWindowMinutes } from "./watchdog-policy";

describe("scoreSyncFreshnessWindowMinutes", () => {
  it.each([
    "2026-09-10T23:00:00.000Z",
    "2026-09-13T18:00:00.000Z",
    "2026-09-14T02:00:00.000Z",
  ])("requires a recent sync during a game window (%s)", (value) => {
    expect(scoreSyncFreshnessWindowMinutes(new Date(value))).toBe(40);
  });

  it("allows the daily backstop outside game windows", () => {
    expect(scoreSyncFreshnessWindowMinutes(new Date("2026-09-09T12:00:00.000Z"))).toBe(1_800);
  });

  it("accepts a recent healthy attempt", () => {
    expect(isScoreSyncReady({
      status: "healthy",
      lastAttemptAt: "2026-09-10T22:35:00.000Z",
      now: new Date("2026-09-10T23:00:00.000Z"),
      freshnessWindowMinutes: 40,
    })).toBe(true);
  });

  it("rejects a stale attempt", () => {
    expect(isScoreSyncReady({
      status: "healthy",
      lastAttemptAt: "2026-09-10T22:00:00.000Z",
      now: new Date("2026-09-10T23:00:00.000Z"),
      freshnessWindowMinutes: 40,
    })).toBe(false);
  });

  it("rejects a recent failed attempt", () => {
    expect(isScoreSyncReady({
      status: "failed",
      lastAttemptAt: "2026-09-10T22:55:00.000Z",
      now: new Date("2026-09-10T23:00:00.000Z"),
      freshnessWindowMinutes: 40,
    })).toBe(false);
  });
});
