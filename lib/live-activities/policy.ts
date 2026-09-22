import { z } from "zod";

export const MINUTE = 60_000;
export const SESSION_MS = 450 * MINUTE; // Leave room before Apple's eight-hour limit.
export const GAME_DAY_ZONE = "America/New_York";
export const preferencesSchema = z.object({
  enabled: z.boolean(), deadline: z.boolean(), race: z.boolean(),
}).strict();
export const defaultPreferences = { enabled: false, deadline: true, race: true };
export const tokenSchema = z.string().regex(/^[a-fA-F0-9]{64,512}$/)
  .refine((token) => token.length % 2 === 0).transform((token) => token.toLowerCase());
export const registrationSchema = z.object({
  installationId: z.uuid(), environment: z.enum(["sandbox", "production"]),
  pushToStartToken: tokenSchema.nullable(), authorized: z.boolean(), preferences: preferencesSchema,
}).strict();
export const installationSchema = z.object({ installationId: z.uuid() }).strict();
export const followSchema = installationSchema.extend({ gameId: z.uuid() }).strict();
export const activityUpdateSchema = installationSchema.extend({
  sessionId: z.uuid(), activityId: z.string().min(1).max(128),
  updateToken: tokenSchema.optional(), status: z.enum(["active", "dismissed", "ended"]),
}).strict();
export const stopSchema = installationSchema.extend({ sessionId: z.uuid() }).strict();

export type ActivityKind = "deadline" | "game" | "race";
export type ActivityGame = {
  id: string; kickoffAt: Date; status: string;
  awayTeamCode: string; homeTeamCode: string; awayScore: number | null; homeScore: number | null;
};
export type ActivityWindow = { key: string; startsAt: Date; endsAt: Date; gameIds: string[] };

export function gameDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: GAME_DAY_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function deadlineWindow(input: {
  weekStatus: string; deadline: Date; submitted: boolean; now: Date;
}): ActivityWindow | null {
  const startsAt = new Date(input.deadline.getTime() - 30 * MINUTE);
  if (input.weekStatus !== "published" || input.submitted || input.now < startsAt || input.now >= input.deadline) return null;
  return { key: `deadline:${input.deadline.toISOString()}`, startsAt, endsAt: input.deadline, gameIds: [] };
}

/** Kickoff's Eastern date is stable across users, DST, midnight, and overseas games. */
export function raceWindows(games: ActivityGame[], now: Date): ActivityWindow[] {
  const byDay = new Map<string, ActivityGame[]>();
  for (const game of games) {
    if (game.status === "canceled") continue;
    const day = gameDay(game.kickoffAt);
    byDay.set(day, [...(byDay.get(day) ?? []), game]);
  }
  return [...byDay].flatMap(([day, dayGames]) => {
    // Postponed games must not keep an old session alive indefinitely.
    if (!dayGames.some((game) => ["scheduled", "in_progress"].includes(game.status))) return [];
    const first = Math.min(...dayGames.map((game) => game.kickoffAt.getTime()));
    const last = Math.max(...dayGames.map((game) => game.kickoffAt.getTime()));
    const start = first - 10 * MINUTE;
    const stop = last + 8 * 60 * MINUTE;
    if (now.getTime() < start || now.getTime() >= stop) return [];
    const segment = Math.floor((now.getTime() - start) / SESSION_MS);
    const startsAt = new Date(start + segment * SESSION_MS);
    return [{ key: `race:${day}:${segment}`, startsAt,
      endsAt: new Date(Math.min(startsAt.getTime() + SESSION_MS, stop)), gameIds: dayGames.map((game) => game.id) }];
  });
}

export function canFollow(game: ActivityGame, now: Date): boolean {
  return ["scheduled", "in_progress"].includes(game.status)
    && game.kickoffAt.getTime() <= now.getTime() + 7 * 60 * MINUTE
    && game.kickoffAt.getTime() > now.getTime() - 8 * 60 * MINUTE;
}

// All timestamps are Unix seconds, not Swift Date's reference-date encoding.
export type ActivityState = {
  title: string; detail: string; updatedAt: number; staleAt: number;
  deadline: number; picksSaved: number; totalGames: number;
  correct: number; remaining: number; rank: number | null; playerCount: number; behind: number;
  awayCode: string; homeCode: string; awayScore: number | null; homeScore: number | null;
  gameStatus: string; clock: string; selectedTeam: string;
};
export type ActivityAttributes = {
  sessionId: string; userId: string; weekId: string; weekLabel: string; kind: ActivityKind; gameId: string;
};
export function emptyState(now: Date): ActivityState {
  const timestamp = Math.floor(now.getTime() / 1000);
  return { title: "Any Given Pick", detail: "", updatedAt: timestamp, staleAt: timestamp + 180,
    deadline: 0, picksSaved: 0, totalGames: 0, correct: 0, remaining: 0, rank: null,
    playerCount: 0, behind: 0, awayCode: "", homeCode: "", awayScore: null, homeScore: null,
    gameStatus: "scheduled", clock: "", selectedTeam: "" };
}
export function activityPayload(input: {
  event: "start" | "update" | "end"; attributes: ActivityAttributes; state: ActivityState; now: Date;
}) {
  const timestamp = Math.floor(input.now.getTime() / 1000);
  return { aps: {
    timestamp, event: input.event, "content-state": input.state,
    ...(input.event === "end" ? { "dismissal-date": timestamp } : { "stale-date": input.state.staleAt }),
    ...(input.event === "start" ? {
      "attributes-type": "PickActivityAttributes", attributes: input.attributes,
      "input-push-token": 1,
      alert: { title: input.attributes.weekLabel, body: input.state.title },
    } : {}),
  } };
}
