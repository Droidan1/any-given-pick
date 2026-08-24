import type { Metadata } from "next";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { BrandLockup } from "@/components/brand-lockup";
import { Icon } from "@/components/icons";
import { MobileAppNav } from "@/components/mobile-app-nav";
import { listAdminUsers } from "@/lib/admin/users";
import { listPendingPrivacyRequests } from "@/lib/admin/privacy-requests";
import { hasAdminRole } from "@/lib/auth/admin";
import { requireAppUser } from "@/lib/auth/app-user";
import { isUserApprovalRequired } from "@/lib/auth/user-approval";
import { evaluateScoreSyncWatchdog, type ScoreSyncStatus } from "@/lib/scores/health";
import { listActiveOperationalAlerts } from "@/lib/monitoring/operational-alerts";
import { listCommissionerAnnouncements } from "@/lib/announcements/service";
import { CommissionerAnnouncementManager } from "./commissioner-announcement-manager";
import { PrivacyRequestList } from "./privacy-request-list";
import { UserAccessList } from "./user-access-list";

export const metadata: Metadata = {
  title: "Admin settings",
  description: "Approve player access and open Any Given Pick commissioner tools.",
};

const adminSettingsDesignContract = `<!--
THESIS: The coach's booth recognizes every player before opening the season tools, never reducing trust to decorative dashboard metrics.
OWN-WORLD: Field-green framing, warm ruled paper, maize actions, condensed calls, and hard-edged controls from the Coach's Call Sheet system.
STORY: Review verified identities, approve or remove access with an audit trail, then move into schedule operations.
FIRST VIEWPORT: A compact booth header leads into the pending-first access roster, followed by two full-width schedule action rows.
FORM: Protected roster and task directory extending the established admin workspace; incumbent seed dbd731b4.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

const BUSINESS_TIME_ZONE = "America/Indiana/Indianapolis";

function formatSyncTime(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function scoreStatusLabel(status: ScoreSyncStatus): string {
  if (status === "healthy") return "Healthy";
  if (status === "warning") return "Partial warning";
  if (status === "failed") return "Needs attention";
  if (status === "running") return "Checking now";
  return "Not started";
}

export default async function AdminSettingsPage() {
  await auth.protect();
  const appUser = await requireAppUser();
  const isAdmin = await hasAdminRole(appUser.id);

  if (!isAdmin) {
    return (
      <main className="admin-access-shell" data-design-seed="dbd731b4">
        <template dangerouslySetInnerHTML={{ __html: adminSettingsDesignContract }} />
        <section className="admin-access-sheet">
          <Link href="/" className="admin-brand" aria-label="Any Given Pick home">
            <BrandLockup />
          </Link>
          <h1>This call is for the coaching staff</h1>
          <p>Your account is signed in, but it does not have administrator access.</p>
          <Link href="/" className="admin-return-link">Return to the player call sheet</Link>
        </section>
        <MobileAppNav active="admin" />
      </main>
    );
  }

  const [userDirectory, scoreHealth, privacyRequests, operationalAlerts, announcements] = await Promise.all([
    listAdminUsers(appUser.id),
    evaluateScoreSyncWatchdog().then((result) => result.health),
    listPendingPrivacyRequests(),
    listActiveOperationalAlerts(),
    listCommissionerAnnouncements(),
  ]);
  const approvalRequired = isUserApprovalRequired();
  const alertEmailConfigured = Boolean(process.env.RESEND_API_KEY);

  return (
    <main className="admin-shell" data-design-seed="dbd731b4">
      <template dangerouslySetInnerHTML={{ __html: adminSettingsDesignContract }} />
      <header className="admin-header">
        <Link href="/" className="admin-brand" aria-label="Any Given Pick home">
          <BrandLockup />
        </Link>
        <div className="admin-header__title">
          <strong>Admin settings</strong>
          <span>Coach&apos;s booth</span>
        </div>
        <div className="admin-header__actions">
          <Link href="/" className="admin-text-link">Player view</Link>
          <UserButton />
        </div>
      </header>

      <section className="admin-settings-workspace" aria-labelledby="admin-settings-title">
        <div className="admin-settings-intro">
          <div>
            <h1 id="admin-settings-title">Run the booth</h1>
            <p>Recognize every player, control account access, and prepare each private call sheet before it reaches the field.</p>
          </div>
          <span className="admin-status-stamp">
            Approval gate {approvalRequired ? "on" : "off"}
          </span>
        </div>

        <CommissionerAnnouncementManager announcements={announcements} />

        <UserAccessList directory={userDirectory} />

        <PrivacyRequestList requests={privacyRequests} />

        <section className="admin-operations-health" aria-labelledby="operations-health-title">
          <header className="admin-settings-section-heading">
            <h2 id="operations-health-title">Operations monitor</h2>
            <p>Unhandled server errors and score-feed failures are recorded here. Email delivery is attempted without including birth dates, coordinates, profile photos, email addresses, or pick selections.</p>
            <span className="admin-status-stamp">
              Alert email {alertEmailConfigured ? "on" : "needs setup"}
            </span>
          </header>
          {operationalAlerts.length > 0 ? (
            <div className="admin-operations-health__alerts">
              {operationalAlerts.map((alert) => (
                <article className={`admin-operation-alert admin-operation-alert--${alert.severity}`} key={alert.fingerprint}>
                  <div><strong>{alert.kind.replaceAll("_", " ")}</strong><span>{alert.message}</span></div>
                  <small>{alert.occurrenceCount} {alert.occurrenceCount === 1 ? "occurrence" : "occurrences"} · Last seen {formatSyncTime(alert.lastSeenAt)}</small>
                </article>
              ))}
            </div>
          ) : (
            <p className="admin-operations-health__clear">No active operational alerts.</p>
          )}
        </section>

        <section className="admin-score-health" aria-labelledby="score-feed-title">
          <header className="admin-settings-section-heading admin-settings-section-heading--score">
            <div>
              <h2 id="score-feed-title">Score & reference-line feed</h2>
              <p>The secure production job refreshes upcoming moneylines and Monday totals during its daily check, then checks active games during live windows. Final scores can still be entered from contest-week controls.</p>
            </div>
            <span className={`admin-sync-stamp admin-sync-stamp--${scoreHealth.status}`}>
              {scoreStatusLabel(scoreHealth.status)}
            </span>
          </header>
          <div className="admin-score-health__grid">
            <div><span>Last successful check</span><strong>{formatSyncTime(scoreHealth.lastSuccessAt)}</strong></div>
            <div><span>Last attempt</span><strong>{formatSyncTime(scoreHealth.lastAttemptAt)}</strong></div>
            <div><span>Games checked</span><strong>{scoreHealth.checkedGames}</strong></div>
            <div><span>Games updated</span><strong>{scoreHealth.updatedGames}</strong></div>
          </div>
          {scoreHealth.errorMessage ? (
            <p className="admin-score-health__error"><strong>Latest provider note:</strong> {scoreHealth.errorMessage}</p>
          ) : null}
        </section>

        <header className="admin-settings-section-heading">
          <h2>Contest controls</h2>
          <p>Review official player cards, import the season, and publish each contest week.</p>
        </header>
        <nav className="admin-settings-list" aria-label="Administrator tools">
          <Link href="/admin/picks" className="admin-settings-call admin-settings-call--primary">
            <Icon name="results" />
            <span><strong>Review player picks</strong><small>See who submitted and open every official card after lock.</small></span>
            <Icon name="arrow" />
          </Link>
          <Link href="/admin/weeks/import" className="admin-settings-call">
            <Icon name="picks" />
            <span><strong>Import season schedule</strong><small>Add preseason and regular-season games from one file.</small></span>
            <Icon name="arrow" />
          </Link>
          <Link href="/admin/weeks" className="admin-settings-call">
            <Icon name="settings" />
            <span><strong>Manage contest weeks</strong><small>Edit deadlines, review matchups, and publish each week.</small></span>
            <Icon name="arrow" />
          </Link>
        </nav>

        <footer className="admin-settings-note">
          <Icon name="shield" />
          <p><strong>Protected controls.</strong> These links and pages are available only to accounts with an administrator role.</p>
        </footer>
      </section>
      <MobileAppNav active="admin" isAdmin />
    </main>
  );
}
