import type { RevealedEntry, WeeklyResults } from "../results/service";

export type AdminPlayerPickStatus = "submitted" | "not_submitted" | "disqualified";

export type AdminPlayerPickCard = {
  userId: string;
  displayName: string;
  submissionStatus: AdminPlayerPickStatus;
  entry: RevealedEntry | null;
};

export type AdminPicksRosterRow = {
  userId: string;
  displayName: string;
  currentVersionNumber: number | null;
  entryStatus: "draft" | "submitted" | "locked" | "scored" | "disqualified" | null;
};

export function buildAdminPlayerPickCards(input: {
  roster: AdminPicksRosterRow[];
  entries: RevealedEntry[];
  revealStatus: WeeklyResults["revealStatus"];
}): AdminPlayerPickCard[] {
  const revealedEntries = new Map(input.entries.map((entry) => [entry.userId, entry]));
  const players = input.roster.map((player): AdminPlayerPickCard => {
    const submissionStatus: AdminPlayerPickStatus = player.entryStatus === "disqualified"
      ? "disqualified"
      : (player.currentVersionNumber ?? 0) > 0
        ? "submitted"
        : "not_submitted";
    return {
      userId: player.userId,
      displayName: player.displayName,
      submissionStatus,
      entry: input.revealStatus === "revealed"
        ? revealedEntries.get(player.userId) ?? null
        : null,
    };
  });
  const order: Record<AdminPlayerPickStatus, number> = {
    not_submitted: 0,
    submitted: 1,
    disqualified: 2,
  };
  return players.toSorted((left, right) => (
    order[left.submissionStatus] - order[right.submissionStatus]
    || left.displayName.localeCompare(right.displayName, "en-US")
  ));
}
