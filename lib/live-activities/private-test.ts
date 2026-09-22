import { z } from "zod";
import { emptyState, installationSchema, MINUTE, type ActivityAttributes, type ActivityKind } from "./policy";

export const PRIVATE_TEST_PREFIX = "private-test:";
export const PRIVATE_TEST_DURATION = 5 * MINUTE;
export const privateTestSchema = installationSchema.extend({
  kind: z.enum(["deadline", "game", "race"]), requestId: z.uuid(),
}).strict();
export const isPrivateTest = (sessionKey: string) => sessionKey.startsWith(PRIVATE_TEST_PREFIX);

export function privateTestAllowed(accountState: string, isAdmin: boolean, environment?: string) {
  return accountState === "active" && isAdmin && environment === "sandbox";
}

/** Isolated synthetic state. Never reads or changes player cards, games, or official results. */
export function privateTestContent(session: {
  id: string; contestWeekId: string; kind: string; startsAt: Date; endsAt: Date; status: string;
}, device: { userId: string; environment: string; enabled: boolean; authorized: boolean; deadline: boolean; race: boolean }, now: Date) {
  const step = Math.min(4, Math.max(0, Math.floor((now.getTime() - session.startsAt.getTime()) / MINUTE)));
  const attributes: ActivityAttributes = { sessionId: session.id, userId: device.userId,
    weekId: session.contestWeekId, weekLabel: "PRIVATE TEST", kind: session.kind as ActivityKind, gameId: "", isTest: true };
  const state = { ...emptyState(now), title: `Private ${session.kind} test`, detail: "Sample data only · No real card changes",
    deadline: Math.floor(session.endsAt.getTime() / 1000), totalGames: 16,
    picksSaved: 12 + step, correct: 8 + step, remaining: 8 - step,
    rank: Math.max(1, 5 - step), playerCount: 24, behind: Math.max(0, 4 - step),
    awayCode: "IND", homeCode: "HOU", awayScore: 14 + step * 3, homeScore: 17,
    gameStatus: "in_progress", clock: `Sample update ${step + 1}` };
  const shouldEnd = session.endsAt <= now || session.status === "ending" || device.environment !== "sandbox"
    || !device.enabled || !device.authorized || (session.kind === "deadline" && !device.deadline)
    || (session.kind === "race" && !device.race);
  return { attributes, state, shouldEnd };
}
