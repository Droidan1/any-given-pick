export const DEADLINE_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1_000;

type WeekStatus = "draft" | "published" | "locked" | "final";
type GameStatus = "scheduled" | "in_progress" | "final" | "postponed" | "canceled";

export function isDeadlineReminderDue(input: {
  status: WeekStatus;
  entryDeadline: Date;
  now: Date;
}): boolean {
  const remaining = input.entryDeadline.getTime() - input.now.getTime();
  return input.status === "published"
    && remaining > 0
    && remaining <= DEADLINE_REMINDER_WINDOW_MS;
}

export function areResultsAvailable(statuses: GameStatus[]): boolean {
  return statuses.length > 0
    && statuses.some((status) => status === "final")
    && statuses.every((status) => status === "final" || status === "canceled");
}

export function emailRetryDelayMs(attemptCount: number): number {
  return Math.min(6 * 60 * 60 * 1_000, 5 * 60 * 1_000 * 2 ** Math.max(0, attemptCount - 1));
}
