import { describe, expect, it } from "vitest";

import { buildAdminPlayerPickCards, type AdminPicksRosterRow } from "./picks-rules";
import type { RevealedEntry } from "@/lib/results/service";

const roster: AdminPicksRosterRow[] = [
  { userId: "submitted", displayName: "Submitted Player", currentVersionNumber: 2, entryStatus: "submitted" },
  { userId: "waiting", displayName: "Waiting Player", currentVersionNumber: 0, entryStatus: "draft" },
  { userId: "removed", displayName: "Removed Player", currentVersionNumber: 1, entryStatus: "disqualified" },
];

const revealedEntry: RevealedEntry = {
  userId: "submitted",
  displayName: "Submitted Player",
  isCurrentUser: false,
  versionNumber: 2,
  committedAt: "2026-09-10T21:50:00.000Z",
  mondayPrediction: 45,
  correctPicks: 1,
  gradedPicks: 1,
  picks: [],
};

describe("buildAdminPlayerPickCards", () => {
  it("shows submission status but seals every selection before the deadline", () => {
    const players = buildAdminPlayerPickCards({
      roster,
      entries: [revealedEntry],
      revealStatus: "open",
    });

    expect(players.map(({ submissionStatus, entry }) => ({ submissionStatus, entry }))).toEqual([
      { submissionStatus: "submitted", entry: null },
      { submissionStatus: "not_submitted", entry: null },
      { submissionStatus: "disqualified", entry: null },
    ]);
  });

  it("reveals only the official entry supplied by the post-lock results service", () => {
    const players = buildAdminPlayerPickCards({
      roster,
      entries: [revealedEntry],
      revealStatus: "revealed",
    });

    expect(players[0]?.entry).toBe(revealedEntry);
    expect(players[1]?.entry).toBeNull();
    expect(players[2]?.entry).toBeNull();
  });
});
