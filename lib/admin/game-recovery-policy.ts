export type GameRecoveryCommand =
  | { action: "postpone"; kickoffAt?: never }
  | { action: "cancel"; kickoffAt?: never }
  | { action: "reschedule"; kickoffAt: string };

export type GameRecoveryDecision =
  | { ok: true; status: "postponed" | "canceled" | "scheduled"; kickoffAt?: Date }
  | { ok: false; message: string };

export function gameRecoveryDecision(
  command: GameRecoveryCommand,
  now = new Date(),
): GameRecoveryDecision {
  if (command.action === "postpone") return { ok: true, status: "postponed" };
  if (command.action === "cancel") return { ok: true, status: "canceled" };

  const kickoffAt = new Date(command.kickoffAt);
  if (!Number.isFinite(kickoffAt.getTime())) {
    return { ok: false, message: "Choose a valid replacement kickoff time." };
  }
  if (kickoffAt <= now) {
    return { ok: false, message: "The replacement kickoff must be in the future." };
  }
  return { ok: true, status: "scheduled", kickoffAt };
}
