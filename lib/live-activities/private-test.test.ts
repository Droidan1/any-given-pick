import { describe, expect, it } from "vitest";
import { activityPayload, MINUTE } from "./policy";
import { isPrivateTest, privateTestAllowed, privateTestContent, privateTestSchema } from "./private-test";

const now = new Date("2026-09-22T23:00:00Z");
const session = { id: "s", contestWeekId: "w", kind: "deadline", startsAt: now, endsAt: new Date(+now + 5 * MINUTE), status: "active" };
const device = { userId: "u", environment: "sandbox", enabled: true, authorized: true, deadline: true, race: true };
describe("Isolated private activity samples", () => {
  it("requires active admin and sandbox without weakening ordinary activity policy", () => {
    expect(privateTestAllowed("active", true, "sandbox")).toBe(true);
    expect(privateTestAllowed("active", false, "sandbox")).toBe(false);
    expect(privateTestAllowed("suspended", true, "sandbox")).toBe(false);
    expect(privateTestAllowed("active", true, "production")).toBe(false);
    expect(isPrivateTest("week:w:race:2026-09-22:0")).toBe(false);
    expect(isPrivateTest("private-test:uuid")).toBe(true);
  });
  it("uses strict input with an idempotency key, not custom payloads", () => {
    const input = { installationId: "00000000-0000-4000-8000-000000000001", requestId: "00000000-0000-4000-8000-000000000002", kind: "game" };
    expect(privateTestSchema.safeParse(input).success).toBe(true);
    expect(privateTestSchema.safeParse({ ...input, kind: "broadcast" }).success).toBe(false);
    expect(privateTestSchema.safeParse({ ...input, recipient: "victim" }).success).toBe(false);
  });
  it("labels each payload as test data with bounded changing values", () => {
    for (const kind of ["deadline", "game", "race"]) {
      const initial = privateTestContent({ ...session, kind }, device, now);
      const changed = privateTestContent({ ...session, kind }, device, new Date(+now + 2 * MINUTE));
      expect(initial.attributes).toMatchObject({ isTest: true, weekLabel: "PRIVATE TEST", gameId: "" });
      expect(changed.state.picksSaved).toBeGreaterThan(initial.state.picksSaved);
      expect(changed.state.awayScore).toBeGreaterThan(initial.state.awayScore);
      expect(changed.state.rank).toBeLessThan(initial.state.rank);
      expect(changed.shouldEnd).toBe(false);
      const payload = activityPayload({ event: "start", ...changed, now });
      expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(4096);
      expect(payload.aps.alert?.title).toBe("PRIVATE TEST");
    }
  });
  it("ends at five minutes, on stop, opt-out, permission loss, or environment change", () => {
    expect(privateTestContent(session, device, session.endsAt).shouldEnd).toBe(true);
    expect(privateTestContent({ ...session, status: "ending" }, device, now).shouldEnd).toBe(true);
    for (const changed of [{ enabled: false }, { authorized: false }, { environment: "production" }, { deadline: false }]) {
      expect(privateTestContent(session, { ...device, ...changed }, now).shouldEnd).toBe(true);
    }
    expect(privateTestContent({ ...session, kind: "race" }, { ...device, race: false }, now).shouldEnd).toBe(true);
    expect(session.status).toBe("active"); // samples do not mutate their inputs
  });
});
