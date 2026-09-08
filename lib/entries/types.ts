export type PlayerGame = {
  id: string;
  kickoffAt: string;
  status: "scheduled" | "in_progress" | "final" | "postponed" | "canceled";
  day: string;
  time: string;
  away: { abbreviation: string; name: string };
  home: { abbreviation: string; name: string };
  awayScore: number | null;
  homeScore: number | null;
  isMondayTiebreaker: boolean;
  odds: {
    awayMoneyline: number | null;
    homeMoneyline: number | null;
    overUnder: number | null;
    provider: string;
    updatedAt: string;
  } | null;
};

export type PlayerEntry = {
  id: string;
  boardNumber: number;
  boardName: string;
  archivedAt: string | null;
  lastResetAt: string | null;
  resetRevision: number;
  status: "draft" | "submitted" | "locked" | "scored" | "disqualified";
  draftPicks: Record<string, string>;
  draftRevision: number;
  officialPicks: Record<string, string>;
  mondayPrediction: number | null;
  officialMondayPrediction: number | null;
  officialAction: "submit" | "edit" | null;
  currentVersionNumber: number;
  submittedAt: string | null;
  updatedAt: string;
};

export type LivePlayerPicks = {
  entryId: string;
  boardName: string;
  userId: string;
  displayName: string;
  picks: Record<string, string>;
  updatedAt: string | null;
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
  livePlayerPicks: LivePlayerPicks[];
  entries: PlayerEntry[];
  boardSettings: import("./board-rules").BoardSettings;
};

export type EntryMutationInput = {
  boardId?: string;
  weekId: string;
  picks: Record<string, string>;
  mondayPrediction: number | null;
  baseDraftRevision: number;
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
    | "board_reset"
    | "draft_conflict"
    | "rate_limited"
    | "server_error";
  message: string;
  syncedAt?: string;
  draftRevision?: number;
  serverDraft?: {
    picks: Record<string, string>;
    mondayPrediction: number | null;
    draftRevision: number;
    updatedAt: string;
  };
  boardId?: string;
  receipt?: {
    versionNumber: number;
    committedAt: string;
    action: "submit" | "edit";
    officialPicks: Record<string, string>;
    mondayPrediction: number;
    draftRevision: number;
  };
};
