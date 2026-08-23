import { describe, expect, it } from "vitest";
import { getDeadlineCountdown } from "./countdown";

describe("getDeadlineCountdown", () => {
  const now = new Date("2026-09-09T20:00:00.000Z");

  it("formats multi-day deadlines without noisy seconds", () => {
    expect(getDeadlineCountdown("2026-09-11T23:30:00.000Z", now)).toMatchObject({
      label: "2d 3h until lock",
      tone: "open",
    });
  });

  it("formats same-day deadlines in hours and minutes", () => {
    expect(getDeadlineCountdown("2026-09-09T22:45:00.000Z", now)).toMatchObject({
      label: "2h 45m until lock",
      tone: "soon",
    });
  });

  it("shows seconds during the final hour", () => {
    expect(getDeadlineCountdown("2026-09-09T20:08:07.000Z", now)).toMatchObject({
      label: "8m 07s until lock",
      tone: "urgent",
    });
  });

  it("locks at and after the deadline", () => {
    expect(getDeadlineCountdown(now, now)).toEqual({
      label: "Picks are locked",
      remainingMs: 0,
      tone: "locked",
    });
    expect(getDeadlineCountdown("2026-09-09T19:59:59.000Z", now).tone).toBe("locked");
  });
});
