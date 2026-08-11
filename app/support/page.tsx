import type { Metadata } from "next";
import Link from "next/link";
import { PublicInfoShell } from "@/components/public-info-shell";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with Any Given Pick beta access, entries, scores, or privacy.",
};

const supportTopics = [
  { title: "Account or sign-in", subject: "Any Given Pick account help", copy: "Approval, email-code sign-in, profile-photo, or access trouble." },
  { title: "Picks or scores", subject: "Any Given Pick picks or score issue", copy: "Include the season, week, matchup, and what you expected to see. Never email your password or sign-in code." },
  { title: "Privacy request", subject: "Any Given Pick privacy request", copy: "Use the authenticated Profile control for deletion. Email for access, correction, export, or an appeal." },
  { title: "Security report", subject: "Any Given Pick security report", copy: "Describe the issue without including another player’s personal information or sealed selections." },
];

export default function SupportPage() {
  return (
    <PublicInfoShell
      eyebrow="Beta support · Direct to the builder"
      title="Get the right call reviewed."
      summary="Support messages go directly to brian@Droidan1.dev. Authenticated privacy requests are reviewed and handled as required by applicable law."
    >
      <section>
        <h2>Choose a topic</h2>
        <div className="support-topic-grid">
          {supportTopics.map((topic) => (
            <a href={`mailto:brian@Droidan1.dev?subject=${encodeURIComponent(topic.subject)}`} key={topic.title}>
              <strong>{topic.title}</strong>
              <span>{topic.copy}</span>
              <b>Email support →</b>
            </a>
          ))}
        </div>
      </section>
      <section>
        <h2>Before you send</h2>
        <p>For entry problems, include the page, contest week, device/browser, approximate time, and any visible receipt or error code. Do not send a password, one-time sign-in code, exact coordinate, full birth date, or another player’s private information.</p>
      </section>
      <section>
        <h2>Account deletion</h2>
        <p>Sign in, open <Link href="/profile">Profile</Link>, and use <strong>Delete and anonymize my account</strong>. That authenticated workflow pauses participation, records the request, and alerts the administrator without placing identity details in email.</p>
      </section>
      <section className="support-direct-call">
        <h2>Direct address</h2>
        <a href="mailto:brian@Droidan1.dev">brian@Droidan1.dev</a>
      </section>
    </PublicInfoShell>
  );
}
