export type StandingRow = {
  rank: number;
  userId: string;
  displayName: string;
  correctPicks: number;
  gradedPicks: number;
  tiebreakerDiff: number | null;
};

export type StandingsSnapshot = {
  status: "waiting" | "ready";
  season: number;
  weekOneFinalGames: number;
  weekOneGameCount: number;
  throughWeek: number | null;
  rows: StandingRow[];
};

export type UnrankedStanding = Omit<StandingRow, "rank">;
