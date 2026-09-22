import { describe, expect, it } from "vitest";
import { classifyAPNsFailure, defaultNativePushPreferences, deviceRegistrationSchema, nativeDeliveryApplies, nativePushPayload } from "./policy";

const baseline = {
  kind: "deadline_approaching" as const, preferences: defaultNativePushPreferences, accountState: "active",
  weekStatus: "published", deadline: new Date("2026-09-24T22:00:00Z"), now: new Date("2026-09-24T21:00:00Z"),
  versionNumber: 0, hasDeliveryVersion: false, gameStatuses: ["scheduled" as const],
};

describe("native iPhone delivery policy", () => {
  it("reminds only players without an official submission", () => {
    expect(nativeDeliveryApplies(baseline)).toBe(true);
    expect(nativeDeliveryApplies({ ...baseline, versionNumber: 1 })).toBe(false);
  });
  it("never sends a deadline reminder at or after the lock", () => {
    expect(nativeDeliveryApplies({ ...baseline, now: baseline.deadline })).toBe(false);
    expect(nativeDeliveryApplies({ ...baseline, weekStatus: "locked" })).toBe(false);
  });
  it("rechecks account access and opt-outs", () => {
    for (const accountState of ["pending_approval", "removed", "deleted_anonymized"]) {
      expect(nativeDeliveryApplies({ ...baseline, accountState })).toBe(false);
    }
    expect(nativeDeliveryApplies({ ...baseline, preferences: { ...baseline.preferences, enabled: false } })).toBe(false);
    expect(nativeDeliveryApplies({ ...baseline, preferences: { ...baseline.preferences, deadlineApproaching: false } })).toBe(false);
  });
  it("only announces results for official players when all games settle", () => {
    const result = { ...baseline, kind: "results_available" as const, now: new Date("2026-09-29T12:00:00Z"), versionNumber: 1 };
    expect(nativeDeliveryApplies({ ...result, gameStatuses: ["final", "canceled"] })).toBe(true);
    expect(nativeDeliveryApplies({ ...result, gameStatuses: ["final", "in_progress"] })).toBe(false);
    expect(nativeDeliveryApplies({ ...result, gameStatuses: ["final"], versionNumber: 0 })).toBe(false);
    expect(nativeDeliveryApplies({ ...result, gameStatuses: ["canceled"] })).toBe(false);
  });
  it("requires a real version for submission receipts", () => {
    expect(nativeDeliveryApplies({ ...baseline, kind: "picks_submitted" })).toBe(false);
    expect(nativeDeliveryApplies({ ...baseline, kind: "picks_submitted", hasDeliveryVersion: true })).toBe(true);
  });
  it("validates tokens, platform environment and explicit preferences", () => {
    const registration = { installationId: "2d1972af-b99e-4f8c-b6c3-5340a02c641f", deviceToken: "A".repeat(64), environment: "sandbox", preferences: defaultNativePushPreferences };
    expect(deviceRegistrationSchema.parse(registration).deviceToken).toBe("a".repeat(64));
    expect(deviceRegistrationSchema.safeParse({ ...registration, deviceToken: "not-a-token" }).success).toBe(false);
    expect(deviceRegistrationSchema.safeParse({ ...registration, userId: "someone-else" }).success).toBe(false);
    expect(deviceRegistrationSchema.safeParse({ ...registration, environment: "https://evil.test" }).success).toBe(false);
    expect(deviceRegistrationSchema.safeParse({ ...registration, preferences: {} }).success).toBe(false);
  });
  it("routes alerts with only event and recipient IDs, never arbitrary URLs or pick data", () => {
    const payload = nativePushPayload({ title: "Results ready", body: "See your card", kind: "results_available", weekId: "week", userId: "user" });
    expect(payload).toEqual({ aps: { alert: { title: "Results ready", body: "See your card" }, sound: "default", "thread-id": "week" }, kind: "results_available", weekId: "week", userId: "user" });
  });
  it("distinguishes invalid devices from temporary delivery failures", () => {
    expect(classifyAPNsFailure(410, "Unregistered")).toBe("invalid_device");
    expect(classifyAPNsFailure(400, "BadDeviceToken")).toBe("invalid_device");
    expect(classifyAPNsFailure(403, "InvalidProviderToken")).toBe("retry");
    expect(classifyAPNsFailure(429, "TooManyRequests")).toBe("retry");
    expect(classifyAPNsFailure(500, "InternalServerError")).toBe("retry");
    expect(classifyAPNsFailure(413, "PayloadTooLarge")).toBe("permanent");
  });
});
