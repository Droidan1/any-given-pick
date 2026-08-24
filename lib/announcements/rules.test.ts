import { describe, expect, it } from "vitest";
import { getAnnouncementDisplayState, isAnnouncementActive } from "./rules";

const now = "2026-08-24T16:00:00.000Z";

describe("commissioner announcement rules", () => {
  it("separates drafts, scheduled notices, and archived notices", () => {
    expect(getAnnouncementDisplayState({ status: "draft", startsAt: now, expiresAt: null, now })).toBe("draft");
    expect(getAnnouncementDisplayState({ status: "published", startsAt: "2026-08-25T16:00:00.000Z", expiresAt: null, now })).toBe("scheduled");
    expect(getAnnouncementDisplayState({ status: "archived", startsAt: now, expiresAt: null, now })).toBe("archived");
  });

  it("makes a published notice active only inside its display window", () => {
    expect(isAnnouncementActive({ status: "published", startsAt: "2026-08-24T15:00:00.000Z", expiresAt: null, now })).toBe(true);
    expect(isAnnouncementActive({ status: "published", startsAt: "2026-08-24T15:00:00.000Z", expiresAt: "2026-08-24T16:00:00.000Z", now })).toBe(false);
    expect(getAnnouncementDisplayState({ status: "published", startsAt: "2026-08-24T15:00:00.000Z", expiresAt: "2026-08-24T16:00:00.000Z", now })).toBe("expired");
  });
});
