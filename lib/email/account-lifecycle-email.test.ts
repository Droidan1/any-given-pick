import { describe, expect, it } from "vitest";
import { buildAccountLifecycleEmail } from "./account-lifecycle-email";

const occurredAt = new Date("2026-08-12T00:30:00.000Z");

describe("account lifecycle email templates", () => {
  it("gives administrators a direct link to the approval queue", () => {
    const email = buildAccountLifecycleEmail({
      kind: "admin_approval_needed",
      displayName: "Brian <script>alert(1)</script>",
      verifiedEmail: "player@example.com",
      occurredAt,
    });

    expect(email.subject).toContain("New player needs approval");
    expect(email.text).toContain("https://anygivenpick.app/admin");
    expect(email.text).toContain("player@example.com");
    expect(email.html).toContain("Brian &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).not.toContain("Brian <script>");
  });

  it("sends approved players to complete their profile", () => {
    const email = buildAccountLifecycleEmail({
      kind: "account_approved",
      displayName: "Napalm",
      verifiedEmail: "napalm@example.com",
      occurredAt,
    });

    expect(email.subject).toBe("You're approved to play Any Given Pick");
    expect(email.text).toContain("https://anygivenpick.app/profile");
    expect(email.html).toContain("You&#039;re cleared to play");
  });
});
