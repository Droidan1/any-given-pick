export type DraftWriteDecision =
  | { kind: "already_synced"; revision: number }
  | { kind: "conflict"; revision: number }
  | { kind: "write"; revision: number };

export function draftWriteDecision(input: {
  baseRevision: number;
  currentRevision: number;
  payloadMatches: boolean;
}): DraftWriteDecision {
  if (input.payloadMatches) {
    return { kind: "already_synced", revision: input.currentRevision };
  }
  if (input.baseRevision !== input.currentRevision) {
    return { kind: "conflict", revision: input.currentRevision };
  }
  return { kind: "write", revision: input.currentRevision + 1 };
}
