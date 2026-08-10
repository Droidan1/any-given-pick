import type { SeasonPhase } from "./schedule-import";

type ExistingSeasonWeek = {
  id: string;
  seasonPhase: SeasonPhase;
  weekNumber: number;
  status: "draft" | "published" | "locked" | "final";
};

type ImportedSeasonWeek = {
  seasonPhase: SeasonPhase;
  weekNumber: number;
};

function weekKey(week: ImportedSeasonWeek): string {
  return `${week.seasonPhase}:${week.weekNumber}`;
}

export function findStaleSeasonDrafts(
  existingWeeks: ExistingSeasonWeek[],
  importedWeeks: ImportedSeasonWeek[],
): ExistingSeasonWeek[] {
  const importedWeekKeys = new Set(importedWeeks.map(weekKey));
  return existingWeeks.filter(
    (week) => week.status === "draft" && !importedWeekKeys.has(weekKey(week)),
  );
}
