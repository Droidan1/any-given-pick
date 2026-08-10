import type { SeasonPhase } from "@/lib/admin/schedule-import";

export type ProviderScheduleGame = {
  seasonPhase: SeasonPhase;
  weekNumber: number;
  kickoffAt: string;
  awayTeamCode: string;
  awayTeamName: string;
  homeTeamCode: string;
  homeTeamName: string;
  isTiebreaker: boolean;
  providerGameKey: string;
};

export type ProviderSchedule = {
  provider: string;
  providerLabel: string;
  season: number;
  fetchedAt: string;
  sourceUrl: string;
  verificationUrl: string;
  scheduleText: string;
  weekCount: number;
  gameCount: number;
  warnings: string[];
};

export type ScheduleProvider = {
  id: string;
  label: string;
  fetchSeasonSchedule: (season: number) => Promise<ProviderSchedule>;
};
