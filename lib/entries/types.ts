export type PlayerGame = {
  id: string;
  kickoffAt: string;
  day: string;
  time: string;
  away: { abbreviation: string; name: string };
  home: { abbreviation: string; name: string };
  isMondayTiebreaker: boolean;
};

export type PlayerEntry = {
  id: string;
  status: "draft" | "submitted" | "locked" | "scored" | "disqualified";
  draftPicks: Record<string, string>;
  mondayPrediction: number | null;
  currentVersionNumber: number;
  submittedAt: string | null;
  updatedAt: string;
};

export type PlayerWeek = {
  id: string;
  season: number;
  seasonPhase: "preseason" | "regular";
  weekNumber: number;
  label: string;
  entryDeadline: string;
  deadlineLabel: string;
  isLocked: boolean;
  games: PlayerGame[];
  entry: PlayerEntry | null;
};

export type EntryMutationInput = {
  weekId: string;
  picks: Record<string, string>;
  mondayPrediction: number | null;
};

export type EntryActionResult = {
  ok: boolean;
  code:
    | "saved"
    | "submitted"
    | "invalid_input"
    | "not_found"
    | "not_open"
    | "deadline_passed"
    | "ineligible"
    | "incomplete"
    | "invalid_pick"
    | "rate_limited"
    | "server_error";
  message: string;
  syncedAt?: string;
  receipt?: {
    versionNumber: number;
    committedAt: string;
    action: "submit" | "edit";
  };
};
