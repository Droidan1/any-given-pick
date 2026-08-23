export type DeadlineCountdownTone = "open" | "soon" | "urgent" | "locked";

export type DeadlineCountdownState = {
  label: string;
  remainingMs: number;
  tone: DeadlineCountdownTone;
};

const MINUTE_MS = 60 * 1_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function getDeadlineCountdown(
  deadline: string | Date,
  now: number | Date = Date.now(),
): DeadlineCountdownState {
  const deadlineMs = deadline instanceof Date ? deadline.getTime() : new Date(deadline).getTime();
  const nowMs = now instanceof Date ? now.getTime() : now;
  const remainingMs = Number.isFinite(deadlineMs) ? Math.max(0, deadlineMs - nowMs) : 0;

  if (remainingMs === 0) {
    return { label: "Picks are locked", remainingMs: 0, tone: "locked" };
  }

  const days = Math.floor(remainingMs / DAY_MS);
  const hours = Math.floor((remainingMs % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((remainingMs % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((remainingMs % MINUTE_MS) / 1_000);

  if (days > 0) {
    return {
      label: `${days}d ${hours}h until lock`,
      remainingMs,
      tone: "open",
    };
  }

  if (remainingMs > HOUR_MS) {
    return {
      label: `${hours}h ${minutes}m until lock`,
      remainingMs,
      tone: "soon",
    };
  }

  return {
    label: `${minutes}m ${String(seconds).padStart(2, "0")}s until lock`,
    remainingMs,
    tone: "urgent",
  };
}
