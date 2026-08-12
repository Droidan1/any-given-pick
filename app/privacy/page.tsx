import type { Metadata } from "next";
import Link from "next/link";
import { PublicInfoShell } from "@/components/public-info-shell";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How the Any Given Pick beta handles profile, eligibility, location, and contest data.",
};

export default function PrivacyPage() {
  return (
    <PublicInfoShell
      eyebrow="Privacy notice · Effective August 11, 2026"
      title="Your data has one job."
      summary="We collect the information described below to run an age- and location-restricted pick’em beta. We do not sell personal data or use it for targeted advertising."
    >
      <section>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Account identity:</strong> verified email and authentication details are managed by Clerk. The app stores an internal Clerk identifier and one-way hashes of verified identity identifiers.</li>
          <li><strong>Player card:</strong> display name and full date of birth. The date is used to calculate whether you are at least 21.</li>
          <li><strong>Profile photo:</strong> optional photo uploaded to and hosted by Clerk.</li>
          <li><strong>Location eligibility:</strong> your browser sends a coordinate and accuracy value for a one-time state check. The coordinate is sent to the U.S. Census geocoder and is not stored by Any Given Pick. We store the state-level result, rounded accuracy, method, timestamps, and eligibility outcome.</li>
          <li><strong>Contest activity:</strong> drafts, official entry versions, selections, tiebreakers, receipts, scores, and results.</li>
          <li><strong>Email notifications:</strong> your reminder choices and delivery receipts for contest reminders and account-approval messages. The app resolves your verified address from Clerk only when sending and does not copy the address into Postgres delivery records.</li>
          <li><strong>Operations:</strong> account-access and eligibility audit events, rate-limit counters keyed by a one-way hash, and error records designed not to contain birth dates, coordinates, photos, email addresses, or pick selections.</li>
        </ul>
      </section>
      <section>
        <h2>Why we use it</h2>
        <p>We use this information to authenticate accounts, enforce manual beta approval, notify administrators when an account needs review, confirm approval to the account holder, calculate age eligibility, verify Indiana participation, save and score entries, deliver requested contest reminders and receipts, prevent abuse, answer support requests, investigate errors, and maintain contest integrity.</p>
      </section>
      <section>
        <h2>Service providers</h2>
        <p>Vercel hosts the app, Neon hosts Postgres data, Clerk manages authentication and profile photos, the U.S. Census geocoder resolves a submitted coordinate to a state, ESPN supplies public schedule and score data, and Resend delivers account-status messages, player reminders, submission receipts, support messages, and operational email. Providers process data only for their service role.</p>
      </section>
      <section>
        <h2>Retention and deletion</h2>
        <p>Birth date, profile, and identity mappings remain while the account is active. Expired standalone location-check records older than 30 days are removed during later checks. Official entry eligibility snapshots and audit records may remain for contest integrity. Rate-limit buckets expire automatically and are periodically deleted.</p>
        <p>From <Link href="/profile">Profile</Link>, an authenticated user can request account deletion and anonymization. The account becomes read-only while pending. Completion deletes the Clerk identity and profile photo, removes identity mappings, display-name history, and location-check history, and replaces the player card with non-personal placeholders. Official submitted picks may remain under an anonymous label so past results remain accurate.</p>
        <p>Encrypted database recovery history may contain an earlier copy until the configured backup-retention period expires. Recovery copies are restricted to incident restoration and are not used for ordinary app activity.</p>
      </section>
      <section>
        <h2>Your choices and requests</h2>
        <p>You may decline the optional photo or location permission; declining location keeps participation read-only. You can turn any optional contest email category on or off from <Link href="/profile#email-reminders">Profile → Email reminders</Link>. Approval-request and approval-confirmation messages are transactional account notices and are not controlled by those reminder settings. You may request access, correction, a portable summary, deletion, or an appeal by emailing <a href="mailto:brian@Droidan1.dev?subject=Any%20Given%20Pick%20privacy%20request">brian@Droidan1.dev</a>. We accept authenticated privacy requests for beta users regardless of whether a particular privacy statute applies.</p>
      </section>
      <section>
        <h2>Security and children</h2>
        <p>The beta uses access controls, server-side authorization, encrypted provider connections, hashed identifiers, rate limits, append-only audit events, monitoring, and recovery procedures. No system is perfectly secure. The service is intended only for adults 21 and older and is not directed to children.</p>
      </section>
      <section>
        <h2>Changes and contact</h2>
        <p>Material changes will update the effective date on this page. Privacy questions and incident reports go to <a href="mailto:brian@Droidan1.dev?subject=Any%20Given%20Pick%20privacy">brian@Droidan1.dev</a>.</p>
      </section>
    </PublicInfoShell>
  );
}
