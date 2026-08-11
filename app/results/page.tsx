import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { BrandLockup } from "@/components/brand-lockup";
import { Icon } from "@/components/icons";
import { MobileAppNav } from "@/components/mobile-app-nav";
import { hasAdminRole } from "@/lib/auth/admin";
import { requireAppUser } from "@/lib/auth/app-user";
import { getAccountSummary } from "@/lib/eligibility/service";
import { getWeeklyResults, type RevealedPick } from "@/lib/results/service";

export const metadata: Metadata = {
  title: "Weekly results",
  description: "Review every official Any Given Pick card after the weekly deadline.",
};

const BUSINESS_TIME_ZONE = "America/Indiana/Indianapolis";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function resultLabel(pick: RevealedPick): string {
  if (pick.outcome === "won") return "Won";
  if (pick.outcome === "lost") return "Lost";
  if (pick.outcome === "tie") return "Tie";
  if (pick.gameStatus === "in_progress") return "Live";
  if (pick.gameStatus === "postponed") return "Postponed";
  if (pick.gameStatus === "canceled") return "Canceled";
  return "Upcoming";
}

function scoreLabel(pick: RevealedPick): string {
  if (pick.awayScore === null || pick.homeScore === null) return "—";
  return `${pick.awayTeamCode} ${pick.awayScore} · ${pick.homeTeamCode} ${pick.homeScore}`;
}

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await auth.protect();
  const appUser = await requireAppUser();
  const [{ week }, account, isAdmin] = await Promise.all([
    searchParams,
    getAccountSummary(appUser.id),
    hasAdminRole(appUser.id),
  ]);
  if (account.accountState !== "active" && !isAdmin) redirect("/profile");

  const results = await getWeeklyResults({
    weekId: week,
    currentUserId: appUser.id,
  });

  return (
    <main className="account-shell results-shell">
      <header className="account-header">
        <Link href="/" className="account-brand" aria-label="Any Given Pick home">
          <BrandLockup />
        </Link>
        <div className="account-header__actions">
          <Link href="/" className="text-link">Current call sheet</Link>
          <Link href="/?view=standings" className="text-link">Standings</Link>
          <Link href="/activity" className="text-link">My activity</Link>
          {isAdmin ? <Link href="/admin" className="text-link">Admin</Link> : null}
          <UserButton />
        </div>
      </header>

      <section className="account-sheet results-sheet">
        <div className="results-intro">
          <div>
            <p className="week-label">Weekly results</p>
            <h1>The calls are in</h1>
            <p>Official cards become visible to every approved player at the server-controlled deadline. Drafts and later unsent edits stay private.</p>
          </div>
          <Icon name="results" />
        </div>

        {results.weeks.length > 0 ? (
          <form className="results-week-picker" method="get">
            <label htmlFor="results-week">Call sheet</label>
            <select id="results-week" name="week" defaultValue={results.selectedWeek?.id}>
              {results.weeks.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.season} · {option.label}
                </option>
              ))}
            </select>
            <button type="submit">Open results <Icon name="arrow" /></button>
          </form>
        ) : null}

        {results.revealStatus === "no_week" ? (
          <section className="results-state" aria-labelledby="results-empty-title">
            <Icon name="clock" />
            <div><h2 id="results-empty-title">No call sheets yet</h2><p>Published weeks will appear here.</p></div>
          </section>
        ) : results.revealStatus === "open" && results.selectedWeek ? (
          <section className="results-state results-state--locked" aria-labelledby="results-locked-title">
            <Icon name="shield" />
            <div>
              <h2 id="results-locked-title">Cards stay sealed until lock</h2>
              <p>{results.selectedWeek.label} official picks reveal at {formatDateTime(results.selectedWeek.entryDeadline)}. Nothing from another player is returned before that instant.</p>
            </div>
          </section>
        ) : (
          <section className="results-board" aria-labelledby="results-board-title">
            <header className="results-board__header">
              <div>
                <p>{results.selectedWeek?.season} · {results.selectedWeek?.seasonPhase === "preseason" ? "Preseason" : "Regular season"}</p>
                <h2 id="results-board-title">{results.selectedWeek?.label}</h2>
              </div>
              <strong>{results.entries.length} official {results.entries.length === 1 ? "card" : "cards"}</strong>
            </header>

            {results.entries.length > 0 ? (
              <div className="results-entries">
                {results.entries.map((entry) => (
                  <details className="results-entry" open={entry.isCurrentUser} key={entry.userId}>
                    <summary>
                      <span className="results-entry__player">
                        <strong>{entry.displayName}</strong>
                        <small>Official version {entry.versionNumber} · {formatDateTime(entry.committedAt)}</small>
                      </span>
                      {entry.isCurrentUser ? <span className="results-entry__you">Your card</span> : null}
                      <span className="results-entry__record">
                        <strong>{entry.correctPicks}/{entry.gradedPicks}</strong>
                        <small>correct</small>
                      </span>
                      <span className="results-entry__tiebreaker">
                        <strong>{entry.mondayPrediction}</strong>
                        <small>tiebreaker</small>
                      </span>
                      <span className="results-entry__toggle" aria-hidden="true">View calls</span>
                    </summary>
                    <div className="results-entry__picks">
                      {entry.picks.map((pick) => (
                        <div className={`results-pick results-pick--${pick.outcome}`} key={pick.gameId}>
                          <span className="results-pick__matchup"><strong>{pick.awayTeamCode} @ {pick.homeTeamCode}</strong><small>{scoreLabel(pick)}</small></span>
                          <span className="results-pick__selection"><small>Selected</small><strong>{pick.selectedTeamCode} · {pick.selectedTeamName}</strong></span>
                          <span className="results-pick__outcome">{resultLabel(pick)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="results-board__empty"><Icon name="picks" /><div><h3>No official cards</h3><p>No player submitted an official entry before this deadline.</p></div></div>
            )}
          </section>
        )}
      </section>
      <MobileAppNav active="standings" isAdmin={isAdmin} />
    </main>
  );
}
