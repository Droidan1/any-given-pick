import { describe, expect, it } from "vitest";
import { activityPayload, canFollow, deadlineWindow, emptyState, gameDay, raceWindows, registrationSchema, activityUpdateSchema, SESSION_MS, type ActivityGame } from "./policy";
const now = new Date("2026-09-27T16:50:00Z");
function game(id: string, kickoff: string, status = "scheduled"): ActivityGame {
  return { id, kickoffAt: new Date(kickoff), status, awayTeamCode: "IND", homeTeamCode: "HOU", awayScore: null, homeScore: null };
}
describe("Live Activity trigger policy", () => {
  it("starts at exactly 30 minutes before lock, never early or at/after lock", () => {
    const input = { weekStatus: "published", deadline: new Date("2026-09-27T17:20:00Z"), submitted: false, now };
    expect(deadlineWindow(input)?.startsAt).toEqual(now);
    expect(deadlineWindow({ ...input, now: new Date(now.getTime() - 1) })).toBeNull();
    expect(deadlineWindow({ ...input, now: input.deadline })).toBeNull();
    expect(deadlineWindow({ ...input, submitted: true })).toBeNull();
    expect(deadlineWindow({ ...input, weekStatus: "draft" })).toBeNull();
    expect(deadlineWindow({ ...input, weekStatus: "locked" })).toBeNull();
  });
  it("starts ten minutes before the first actual kickoff on each day", () => {
    const games = [game("sun", "2026-09-27T17:00:00Z"), game("late", "2026-09-27T20:25:00Z"), game("mon", "2026-09-29T00:15:00Z")];
    expect(raceWindows(games, new Date("2026-09-27T16:49:59Z"))).toEqual([]);
    expect(raceWindows(games, now)[0].gameIds).toEqual(["sun", "late"]);
    expect(raceWindows(games, new Date("2026-09-29T00:05:00Z"))[0].gameIds).toEqual(["mon"]);
  });
  it("continues a late game across midnight without opening tomorrow's slate", () => {
    const games = [game("late", "2026-09-28T00:20:00Z", "in_progress")];
    const window = raceWindows(games, new Date("2026-09-28T04:10:00Z"))[0];
    expect(window.key).toBe("race:2026-09-27:0");
  });
  it("restarts before Apple's eight-hour limit on long days including overseas games", () => {
    const games = [game("early", "2026-09-27T13:30:00Z", "final"), game("late", "2026-09-28T00:20:00Z")];
    const first = raceWindows(games, new Date("2026-09-27T13:20:00Z"))[0];
    const second = raceWindows(games, first.endsAt)[0];
    expect(first.endsAt.getTime() - first.startsAt.getTime()).toBe(SESSION_MS);
    expect(second.key).not.toBe(first.key);
    expect(second.startsAt).toEqual(first.endsAt);
  });
  it("ends once the day's slate is terminal, and bounds postponed or abandoned feeds", () => {
    expect(raceWindows([game("x", "2026-09-27T17:00:00Z", "final")], now)).toEqual([]);
    expect(raceWindows([game("x", "2026-09-27T17:00:00Z", "canceled")], now)).toEqual([]);
    expect(raceWindows([game("x", "2026-09-27T17:00:00Z", "postponed")], now)).toEqual([]);
    expect(raceWindows([game("x", "2026-09-27T17:00:00Z", "in_progress")], new Date("2026-09-28T01:00:00Z"))).toEqual([]);
    expect(raceWindows([], now)).toEqual([]);
  });
  it("uses Eastern dates on both sides of DST rather than server/device timezone", () => {
    expect(gameDay(new Date("2026-11-01T03:30:00Z"))).toBe("2026-10-31");
    expect(gameDay(new Date("2026-11-02T04:30:00Z"))).toBe("2026-11-01");
  });
  it("rejects finished, unpublished-in-time, or too-distant followed games", () => {
    expect(canFollow(game("x", "2026-09-27T17:00:00Z"), now)).toBe(true);
    expect(canFollow(game("x", "2026-09-27T17:00:00Z", "final"), now)).toBe(false);
    expect(canFollow(game("x", "2026-10-04T17:00:00Z"), now)).toBe(false);
    expect(canFollow(game("x", "2026-09-26T17:00:00Z", "in_progress"), now)).toBe(false);
  });
});
describe("Apple payload and token boundaries", () => {
  const attributes = { sessionId: "s", userId: "u", weekId: "w", weekLabel: "Week 3", kind: "race" as const, gameId: "" };
  it("uses Unix seconds and exact shared ActivityKit keys, with no Swift reference-date encoding", () => {
    const state = emptyState(now);
    const payload = activityPayload({ event: "start", attributes, state, now });
    expect(payload.aps.timestamp).toBe(now.getTime() / 1000);
    expect(payload.aps["attributes-type"]).toBe("PickActivityAttributes");
    expect(payload.aps["content-state"]).toEqual(state);
    expect(payload.aps["input-push-token"]).toBe(1);
    expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(4096);
    const update = activityPayload({ event: "update", attributes, state, now });
    expect(update.aps).not.toHaveProperty("alert");
    expect(update.aps).not.toHaveProperty("attributes");
    const end = activityPayload({ event: "end", attributes, state, now });
    expect(end.aps).toHaveProperty("dismissal-date", now.getTime() / 1000);
    expect(end.aps).not.toHaveProperty("stale-date");
  });
  it("bounds and normalizes Apple tokens and rejects injected ownership fields", () => {
    const valid = { installationId: "00000000-0000-4000-8000-000000000001", environment: "sandbox", pushToStartToken: "AB".repeat(32), authorized: true, preferences: { enabled: true, deadline: true, race: true } };
    expect(registrationSchema.parse(valid).pushToStartToken).toBe("ab".repeat(32));
    expect(registrationSchema.safeParse({ ...valid, pushToStartToken: "a".repeat(65) }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...valid, userId: "another-account" }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...valid, pushToStartToken: null }).success).toBe(true);
    expect(activityUpdateSchema.safeParse({ installationId: valid.installationId, sessionId: valid.installationId,
      activityId: "apple-activity", updateToken: "a".repeat(64), status: "active" }).success).toBe(true);
  });
});
