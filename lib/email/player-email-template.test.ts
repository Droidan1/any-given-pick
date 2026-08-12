import { describe, expect, it } from "vitest";
import { buildPlayerEmail } from "./player-email-template";

const base = {
  displayName: "Napalm <script>alert(1)</script>",
  weekLabel: "Regular Season Week 1",
  entryDeadline: new Date("2026-09-10T22:00:00.000Z"),
};

describe("player email templates", () => {
  it("builds a safe weekly publication email with a direct picks link", () => {
    const email = buildPlayerEmail({ ...base, kind: "week_published" });
    expect(email.subject).toContain("Regular Season Week 1");
    expect(email.text).toContain("https://anygivenpick.app/?view=picks");
    expect(email.html).toContain("Napalm &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).not.toContain("Napalm <script>");
  });

  it("includes the committed version in a submission receipt", () => {
    const email = buildPlayerEmail({
      ...base,
      kind: "picks_submitted",
      versionNumber: 3,
      committedAt: new Date("2026-09-10T20:30:00.000Z"),
    });
    expect(email.text).toContain("Official version 3");
    expect(email.html).toContain("View your activity");
  });

  it("sends completed cards to the activity archive", () => {
    const email = buildPlayerEmail({ ...base, kind: "results_available" });
    expect(email.subject).toBe("Regular Season Week 1 results are ready");
    expect(email.text).toContain("https://anygivenpick.app/activity");
  });
});
