import { describe, expect, it } from "vitest";
import {
  areResultsAvailable,
  emailRetryDelayMs,
  isDeadlineReminderDue,
} from "./player-notification-policy";

describe("player email notification policy", () => {
  const now = new Date("2026-09-09T16:00:00.000Z");

  it("queues one deadline reminder only inside the final 24 hours", () => {
    expect(isDeadlineReminderDue({
      status: "published",
      entryDeadline: new Date("2026-09-10T15:59:59.000Z"),
      now,
    })).toBe(true);
    expect(isDeadlineReminderDue({
      status: "published",
      entryDeadline: new Date("2026-09-10T16:00:01.000Z"),
      now,
    })).toBe(false);
    expect(isDeadlineReminderDue({
      status: "draft",
      entryDeadline: new Date("2026-09-09T18:00:00.000Z"),
      now,
    })).toBe(false);
  });

  it("requires every game to be resolved before results are available", () => {
    expect(areResultsAvailable(["final", "final", "canceled"])).toBe(true);
    expect(areResultsAvailable(["final", "in_progress"])).toBe(false);
    expect(areResultsAvailable(["canceled"])).toBe(false);
    expect(areResultsAvailable([])).toBe(false);
  });

  it("backs off retries and caps the delay", () => {
    expect(emailRetryDelayMs(1)).toBe(5 * 60 * 1_000);
    expect(emailRetryDelayMs(2)).toBe(10 * 60 * 1_000);
    expect(emailRetryDelayMs(20)).toBe(6 * 60 * 60 * 1_000);
  });
});
