import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import type { AccountSummary } from "@/lib/account-types";
import type { PlayerWeek } from "@/lib/entries/types";
import { getHomeWeekState } from "@/lib/home-week-state";
import { BrandLockup } from "./brand-lockup";
import { Icon, RouteSketch } from "./icons";
import { MobileAppNav } from "./mobile-app-nav";
import { PwaInstallHomeCard } from "./pwa-install-experience";

type ServerShellView = "home" | "standings";

function eligibilityActionLabel(account: AccountSummary): string {
  if (!account.profileComplete) return "Finish your player card";
  return "Review your player access";
}

function eligibilityStatusLabel(account: AccountSummary): string {
  return account.reasonLabel;
}

function AccountDock({ account, compact = false }: { account: AccountSummary; compact?: boolean }) {
  return (
    <div className={`account-dock${compact ? " account-dock--compact" : ""}`}>
      <UserButton />
      <Link href="/profile" prefetch={false}>
        <span>{account.displayName ?? "Player card"}</span>
        <small>{account.overallResult === "eligible" ? "Eligible" : "Read-only"}</small>
      </Link>
    </div>
  );
}

function DesktopNavigation({ account, isAdmin, active }: { account: AccountSummary; isAdmin: boolean; active: ServerShellView }) {
  return (
    <aside className="side-nav" aria-label="Primary navigation">
      <Link className="brand-home" href="/" prefetch={false} aria-label="Any Given Pick home">
        <BrandLockup />
      </Link>
      <div className="nav-list">
        <Link className={`nav-item nav-item--link${active === "home" ? " nav-item--active" : ""}`} href="/" prefetch={false} aria-current={active === "home" ? "page" : undefined}>
          <Icon name="home" /><span>Home</span>
        </Link>
        <Link className="nav-item nav-item--link" href="/picks" prefetch={false}>
          <Icon name="picks" /><span>Picks</span>
        </Link>
        <Link className={`nav-item nav-item--link${active === "standings" ? " nav-item--active" : ""}`} href="/standings" prefetch={false} aria-current={active === "standings" ? "page" : undefined}>
          <Icon name="standings" /><span>Standings</span>
        </Link>
        <Link className="nav-item nav-item--link" href="/profile" prefetch={false}>
          <Icon name="profile" /><span>Profile</span>
        </Link>
        <Link className="nav-item nav-item--link" href="/activity" prefetch={false}>
          <Icon name="activity" /><span>My activity</span>
        </Link>
        <Link className="nav-item nav-item--link" href="/results" prefetch={false}>
          <Icon name="results" /><span>Results</span>
        </Link>
        {isAdmin ? (
          <Link className="nav-item nav-item--link" href="/admin" prefetch={false}>
            <Icon name="settings" /><span>Admin</span>
          </Link>
        ) : null}
      </div>
      <AccountDock account={account} compact />
    </aside>
  );
}

export function PickemServerShell({
  account,
  isAdmin,
  active,
  children,
}: {
  account: AccountSummary;
  isAdmin: boolean;
  active: ServerShellView;
  children: React.ReactNode;
}) {
  return (
    <main className="app-shell">
      <DesktopNavigation account={account} isAdmin={isAdmin} active={active} />
      <section className="surface">
        <div className="surface-account"><AccountDock account={account} /></div>
        <Link className="mobile-brand" href="/" prefetch={false} aria-label="Any Given Pick home">
          <BrandLockup />
        </Link>
        {children}
      </section>
      <MobileAppNav active={active === "standings" ? "results" : "home"} isAdmin={isAdmin} />
    </main>
  );
}

export function PickemHome({
  account,
  week,
  isAdmin,
}: {
  account: AccountSummary;
  week: PlayerWeek | null;
  isAdmin: boolean;
}) {
  const selectedCount = week
    ? week.games.filter((game) => Boolean(week.entry?.draftPicks[game.id])).length
    : 0;
  const canParticipate = account.overallResult === "eligible";
  const hasSubmitted = (week?.entry?.currentVersionNumber ?? 0) > 0;

  let content;
  if (!week) {
    content = (
      <section className="single-view no-week-view">
        <RouteSketch /><RouteSketch mirrored />
        <p className="week-label">Coach&apos;s call sheet</p>
        <h1>The next slate is being drawn up.</h1>
        <p className="lead">There is no published week yet. Once the commissioner publishes one, the official matchups will appear here automatically.</p>
        <div className="empty-state"><Icon name="picks" /><h2>Check back soon</h2><p>Your player account is ready for kickoff.</p></div>
        <PwaInstallHomeCard />
      </section>
    );
  } else {
    const homeState = getHomeWeekState({
      deadlineLabel: week.deadlineLabel,
      games: week.games,
      hasSubmitted,
      isLocked: week.isLocked,
      selectedCount,
    });
    const statusLabel = homeState.lockedStatusLabel
      ?? eligibilityStatusLabel(account);
    const destination = homeState.destination === "picks"
      ? "/picks"
      : `/${homeState.destination}`;
    const actionLabel = homeState.destination === "picks" && !canParticipate
      ? eligibilityActionLabel(account)
      : homeState.actionLabel;
    const actionHref = homeState.destination === "picks" && !canParticipate
      ? "/profile"
      : destination;

    content = (
      <section className="single-view home-view">
        <RouteSketch /><RouteSketch mirrored />
        <p className="week-label">{week.label} Pick&apos;em</p>
        <h1>One sheet. {week.games.length} calls.</h1>
        <p className="lead">{homeState.lead}</p>
        <div className="home-status">
          <Icon name={homeState.lockedStatusLabel ? "check" : "shield"} />
          <span>{statusLabel}</span>
          <strong>{selectedCount}/{week.games.length} picks</strong>
        </div>
        <Link className="review-action review-action--link" href={actionHref} prefetch={false}>
          <span>{actionLabel}</span><Icon name="arrow" />
        </Link>
        <Link className="home-reminders-link" href="/profile#email-reminders" prefetch={false}>Set deadline and results reminders</Link>
        <PwaInstallHomeCard />
        <div className="home-trust-links">
          <Link href="/rules">Beta rules</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/support">Support</Link>
          <span>Built by <a href="https://droidan1.dev">Droidan1</a></span>
        </div>
      </section>
    );
  }

  return <PickemServerShell account={account} isAdmin={isAdmin} active="home">{content}</PickemServerShell>;
}
