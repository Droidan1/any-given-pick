import type { PlayerGame } from "@/lib/entries/types";

export type HomeWeekDestination = "picks" | "activity" | "results" | "race";

export type HomeWeekState = {
  actionLabel: string;
  destination: HomeWeekDestination;
  lead: string;
  lockedStatusLabel: string | null;
};

export function getHomeWeekState({
  deadlineLabel,
  games,
  hasSubmitted,
  isLocked,
  selectedCount,
}: {
  deadlineLabel: string;
  games: PlayerGame[];
  hasSubmitted: boolean;
  isLocked: boolean;
  selectedCount: number;
}): HomeWeekState {
  const allGamesComplete = games.length > 0 && games.every((game) =>
    game.status === "final" || game.status === "canceled",
  );
  const gamesHaveStarted = games.some((game) =>
    game.status === "in_progress" || game.status === "final",
  );

  if (allGamesComplete) {
    return {
      actionLabel: "View your results",
      destination: "activity",
      lead: "Every game is final. See how your official calls finished.",
      lockedStatusLabel: hasSubmitted ? "Results final" : "Week complete",
    };
  }

  if (isLocked && hasSubmitted) {
    return gamesHaveStarted
      ? {
          actionLabel: "Follow the live week race",
          destination: "race",
          lead: "Your official card is locked. Follow each result as games finish.",
          lockedStatusLabel: "Official card locked",
        }
      : {
          actionLabel: "Review official card",
          destination: "activity",
          lead: "Your official card is in. Games will appear here as kickoff approaches.",
          lockedStatusLabel: "Official card locked",
        };
  }

  if (isLocked) {
    return {
      actionLabel: "View the live week race",
      destination: "race",
      lead: "This call sheet is locked. Weekly results will appear as games finish.",
      lockedStatusLabel: "Deadline passed",
    };
  }

  if (hasSubmitted) {
    return {
      actionLabel: "Review or update picks",
      destination: "picks",
      lead: `Your official entry is in. You can update it before ${deadlineLabel}.`,
      lockedStatusLabel: null,
    };
  }

  if (selectedCount > 0) {
    return {
      actionLabel: "Continue your picks",
      destination: "picks",
      lead: `Your draft is saved. Finish and submit it before ${deadlineLabel}.`,
      lockedStatusLabel: null,
    };
  }

  return {
    actionLabel: "Make your picks",
    destination: "picks",
    lead: `Make every call and submit your entry before ${deadlineLabel}.`,
    lockedStatusLabel: null,
  };
}
