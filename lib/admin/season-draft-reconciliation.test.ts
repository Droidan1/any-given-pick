import { describe, expect, it } from "vitest";
import { findStaleSeasonDrafts } from "./season-draft-reconciliation";

describe("findStaleSeasonDrafts", () => {
  it("removes only private drafts that are absent from a full provider sync", () => {
    const stale = findStaleSeasonDrafts([
      { id: "pre-1", seasonPhase: "preseason", weekNumber: 1, status: "draft" },
      { id: "pre-2", seasonPhase: "preseason", weekNumber: 2, status: "draft" },
      { id: "pre-3", seasonPhase: "preseason", weekNumber: 3, status: "draft" },
      { id: "pre-4", seasonPhase: "preseason", weekNumber: 4, status: "draft" },
      { id: "reg-1", seasonPhase: "regular", weekNumber: 1, status: "draft" },
      { id: "reg-2", seasonPhase: "regular", weekNumber: 2, status: "published" },
    ], [
      { seasonPhase: "preseason", weekNumber: 1 },
      { seasonPhase: "preseason", weekNumber: 2 },
      { seasonPhase: "preseason", weekNumber: 3 },
      { seasonPhase: "regular", weekNumber: 1 },
    ]);

    expect(stale).toEqual([
      { id: "pre-4", seasonPhase: "preseason", weekNumber: 4, status: "draft" },
    ]);
  });
});
