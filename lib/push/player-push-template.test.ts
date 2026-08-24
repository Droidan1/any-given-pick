import { describe, expect, it } from "vitest";
import { buildPlayerPush, buildWebPushPayload } from "./player-push-template";

const input = {
  weekId: "week-2",
  weekLabel: "Preseason Week 2",
  entryDeadline: new Date("2026-08-19T22:00:00.000Z"),
};

describe("player push templates", () => {
  it("routes published and deadline alerts to the entry sheet", () => {
    expect(buildPlayerPush({ ...input, kind: "week_published" }).url).toBe("/?view=picks");
    expect(buildPlayerPush({ ...input, kind: "deadline_approaching" }).urgency).toBe("high");
  });

  it("routes receipts and final results to the right records", () => {
    expect(buildPlayerPush({ ...input, kind: "picks_submitted", versionNumber: 3 })).toMatchObject({
      url: "/activity",
      tag: "picks-submitted-week-2-3",
    });
    expect(buildPlayerPush({ ...input, kind: "results_available" }).url).toBe("/results");
  });

  it("builds a declarative payload with an absolute same-origin destination", () => {
    const content = buildPlayerPush({ ...input, kind: "results_available" });
    expect(buildWebPushPayload(content)).toMatchObject({
      web_push: 8030,
      notification: {
        navigate: "https://anygivenpick.app/results",
        data: { url: "https://anygivenpick.app/results" },
      },
    });
  });
});
