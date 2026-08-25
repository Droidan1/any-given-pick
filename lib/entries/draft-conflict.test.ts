import { describe, expect, it } from "vitest";
import { draftWriteDecision } from "./draft-conflict";

describe("cross-device draft decisions", () => {
  it("does not report a conflict when both devices already hold the same draft", () => {
    expect(draftWriteDecision({
      baseRevision: 2,
      currentRevision: 4,
      payloadMatches: true,
    })).toEqual({ kind: "already_synced", revision: 4 });
  });

  it("blocks a stale device from silently overwriting a newer draft", () => {
    expect(draftWriteDecision({
      baseRevision: 2,
      currentRevision: 4,
      payloadMatches: false,
    })).toEqual({ kind: "conflict", revision: 4 });
  });

  it("increments the revision for a conflict-free write", () => {
    expect(draftWriteDecision({
      baseRevision: 4,
      currentRevision: 4,
      payloadMatches: false,
    })).toEqual({ kind: "write", revision: 5 });
  });
});
