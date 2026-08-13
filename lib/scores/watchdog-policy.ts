const LIVE_WINDOW_FRESHNESS_MINUTES = 40;
const DAILY_BACKSTOP_FRESHNESS_MINUTES = 30 * 60;

export function isScoreSyncReady(input: {
  status: string;
  lastAttemptAt: string | null;
  now: Date;
  freshnessWindowMinutes: number;
}): boolean {
  if (input.status === "failed" || !input.lastAttemptAt) return false;
  const lastAttemptAgeMs = input.now.getTime() - new Date(input.lastAttemptAt).getTime();
  return Number.isFinite(lastAttemptAgeMs)
    && lastAttemptAgeMs < input.freshnessWindowMinutes * 60 * 1_000;
}

export function scoreSyncFreshnessWindowMinutes(now: Date): number {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const lateWindow = [1, 4, 5, 6].includes(day) && hour >= 22;
  const overnightWindow = [0, 1, 2, 5, 6].includes(day) && hour <= 5;
  const sundayWindow = day === 0 && hour >= 17 && hour <= 21;
  return lateWindow || overnightWindow || sundayWindow
    ? LIVE_WINDOW_FRESHNESS_MINUTES
    : DAILY_BACKSTOP_FRESHNESS_MINUTES;
}
