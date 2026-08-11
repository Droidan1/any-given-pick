import type { Metadata } from "next";
import { PublicInfoShell } from "@/components/public-info-shell";

export const metadata: Metadata = {
  title: "Beta rules",
  description: "Rules for the free Any Given Pick public beta.",
};

export default function RulesPage() {
  return (
    <PublicInfoShell
      eyebrow="Public beta · Rules version 1.0 · August 11, 2026"
      title="Call it fair. Keep it fun."
      summary="Any Given Pick is a free weekly football pick’em beta for approved Indiana adults. There is no purchase, wager, entry fee, or cash prize."
    >
      <section>
        <h2>1. Who can participate</h2>
        <p>You must be at least 21 years old, use a verified sign-in, complete a unique player card, receive administrator approval during the beta, and pass a fresh Indiana location check that remains valid for up to eight hours. A failed, denied, unavailable, outside-state, indeterminate, or expired location check leaves the account in read-only mode.</p>
      </section>
      <section>
        <h2>2. Making an official entry</h2>
        <p>Pick one team in every published matchup and enter the requested combined-score tiebreaker. Drafts are not official. Your latest complete submission accepted by the server before the displayed deadline is your official entry. Server time controls the deadline.</p>
      </section>
      <section>
        <h2>3. Scoring and standings</h2>
        <p>Each correct game winner earns one point. Ties, canceled games, postponed games, and provider corrections are handled according to the final status recorded on the call sheet. Equal records are ordered by the published tiebreaker method. Preseason entries do not count toward regular-season standings.</p>
      </section>
      <section>
        <h2>4. Schedules and corrections</h2>
        <p>The commissioner publishes each week’s slate and may correct team, kickoff, provider, or score data when a reliable source changes. Picks remain sealed from administrators until the entry deadline. Material corrections will be reflected in the app as soon as reasonably possible.</p>
      </section>
      <section>
        <h2>5. Fair play</h2>
        <p>One person may use one approved account. Do not automate submissions, impersonate another player, interfere with the service, exploit errors, or attempt to view sealed picks. The commissioner may restrict or disqualify accounts to protect the beta and its participants, with an audit record of account actions.</p>
      </section>
      <section>
        <h2>6. Beta availability</h2>
        <p>This is pre-release software. Features, schedules, and rules may change; interruptions and provider delays may occur. We will use reasonable efforts to preserve accepted entries and restore service, but uninterrupted availability is not guaranteed.</p>
      </section>
      <section>
        <h2>7. Questions</h2>
        <p>Contact <a href="mailto:brian@Droidan1.dev?subject=Any%20Given%20Pick%20rules">brian@Droidan1.dev</a> before participating if any rule is unclear.</p>
      </section>
    </PublicInfoShell>
  );
}
