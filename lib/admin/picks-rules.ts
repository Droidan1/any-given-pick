import type { RevealedEntry, WeeklyResults } from "../results/service";

export type AdminPlayerPickStatus = "submitted" | "not_submitted" | "disqualified";

export type AdminPlayerPickCard = {
  userId: string;
  entryId?: string | null;
  boardName?: string | null;
  displayName: string;
  submissionStatus: AdminPlayerPickStatus;
  entry: RevealedEntry | null;
  resetState: { draftRevision: number; versionNumber: number } | null;
};

export type AdminPicksRosterRow = {
  userId: string;
  entryId?: string | null;
  boardName?: string | null;
  displayName: string;
  draftRevision?: number | null;
  currentVersionNumber: number | null;
  entryStatus: "draft" | "submitted" | "locked" | "scored" | "disqualified" | null;
};

export function buildAdminPlayerPickCards(input: {
  roster: AdminPicksRosterRow[];
  entries: RevealedEntry[];
  revealStatus: WeeklyResults["revealStatus"];
}): AdminPlayerPickCard[] {
  const revealedEntries = new Map(input.entries.map((entry) => [entry.entryId, entry]));
  const players = input.roster.map((player): AdminPlayerPickCard => {
    const submissionStatus: AdminPlayerPickStatus = player.entryStatus === "disqualified"
      ? "disqualified"
      : (player.currentVersionNumber ?? 0) > 0
        ? "submitted"
        : "not_submitted";
    return {
      userId: player.userId,
      entryId: player.entryId,
      boardName: player.boardName,
      displayName: player.displayName,
      submissionStatus,
      resetState: player.entryId && typeof player.draftRevision === "number" && player.entryStatus !== "disqualified" ? { draftRevision: player.draftRevision, versionNumber: player.currentVersionNumber ?? 0 } : null,
      entry: input.revealStatus === "revealed"
        ? revealedEntries.get(player.entryId ?? "") ?? null
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
