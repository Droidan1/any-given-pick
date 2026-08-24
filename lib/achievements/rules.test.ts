import { describe, expect, it } from "vitest";
import { buildPlayerAchievements, type AchievementCard } from "./rules";

type TestCardInput = Partial<AchievementCard>
  & Pick<AchievementCard, "id" | "weekNumber">
  & {
    winCount?: number;
    lossCount?: number;
    tieCount?: number;
  };

function card(input: TestCardInput): AchievementCard {
  const gameCount = input.gameCount ?? 12;
  const winCount = input.winCount ?? 0;
  const lossCount = input.lossCount ?? Math.max(0, gameCount - winCount);
  const tieCount = input.tieCount ?? 0;
  const outcomes = [
    ...Array.from({ length: winCount }, () => "won" as const),
    ...Array.from({ length: lossCount }, () => "lost" as const),
    ...Array.from({ length: tieCount }, () => "tie" as const),
  ];
  return {
    id: input.id,
    season: input.season ?? 2026,
    seasonPhase: input.seasonPhase ?? "regular",
    weekNumber: input.weekNumber,
    weekLabel: input.weekLabel ?? `Week ${input.weekNumber}`,
    versionNumber: input.versionNumber ?? 1,
    gameCount,
    officialPicks: input.officialPicks ?? outcomes.map((outcome) => ({ gameStatus: "final", outcome })),
  };
}

describe("buildPlayerAchievements", () => {
  it("keeps every patch locked for a player without official cards", () => {
    const achievements = buildPlayerAchievements([]);

    expect(achievements.earnedCount).toBe(0);
    expect(achievements.totalCount).toBe(6);
    expect(achievements.achievements.every((achievement) => !achievement.earned)).toBe(true);
  });

  it("unlocks result achievements and records the week they were earned", () => {
    const achievements = buildPlayerAchievements([
      card({ id: "w1", weekNumber: 1, winCount: 6, lossCount: 6 }),
      card({ id: "w2", weekNumber: 2, winCount: 10, lossCount: 2 }),
      card({ id: "w3", weekNumber: 3, gameCount: 8, winCount: 8, lossCount: 0 }),
    ]);

    expect(achievements.earnedCount).toBe(5);
    expect(achievements.achievements.find((item) => item.id === "first_call")).toMatchObject({ earned: true, earnedOn: "2026 Week 1" });
    expect(achievements.achievements.find((item) => item.id === "film_room")).toMatchObject({ earned: true, earnedOn: "2026 Week 3" });
    expect(achievements.achievements.find((item) => item.id === "double_digits")).toMatchObject({ earned: true, earnedOn: "2026 Week 2" });
    expect(achievements.achievements.find((item) => item.id === "hot_route")).toMatchObject({ earned: true });
    expect(achievements.achievements.find((item) => item.id === "clean_sheet")).toMatchObject({ earned: true, earnedOn: "2026 Week 3" });
  });

  it("ignores unsent draft calls when evaluating result achievements", () => {
    const officialLosses = Array.from({ length: 12 }, () => ({
      gameStatus: "final" as const,
      outcome: "lost" as const,
    }));
    const pendingEdits = card({
      id: "pending-edits",
      weekNumber: 1,
      winCount: 12,
      lossCount: 0,
      officialPicks: officialLosses,
    });

    const achievements = buildPlayerAchievements([pendingEdits]);
    expect(achievements.achievements.find((item) => item.id === "double_digits")).toMatchObject({ earned: false, progress: 0 });
    expect(achievements.achievements.find((item) => item.id === "hot_route")).toMatchObject({ earned: false, progress: 0 });
    expect(achievements.achievements.find((item) => item.id === "clean_sheet")).toMatchObject({ earned: false, progress: 0 });
  });

  it("unlocks iron season only after 18 unique regular-season cards", () => {
    const cards = Array.from({ length: 18 }, (_, index) => card({
      id: `regular-${index + 1}`,
      weekNumber: index + 1,
      winCount: 8,
      lossCount: 4,
    }));

    const ironSeason = buildPlayerAchievements(cards).achievements.find((item) => item.id === "iron_season");
    expect(ironSeason).toMatchObject({
      earned: true,
      earnedOn: "2026 regular season",
      progress: 18,
      target: 18,
    });
  });

  it("does not count Weeks 2 through 19 as a complete 18-week regular season", () => {
    const cards = Array.from({ length: 18 }, (_, index) => card({
      id: `regular-${index + 2}`,
      weekNumber: index + 2,
      winCount: 8,
      lossCount: 4,
    }));

    const ironSeason = buildPlayerAchievements(cards).achievements.find((item) => item.id === "iron_season");
    expect(ironSeason).toMatchObject({
      earned: false,
      earnedOn: null,
      progress: 17,
      target: 18,
    });
  });
});
