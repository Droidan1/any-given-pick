import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { BrandLockup } from "@/components/brand-lockup";
import { Icon } from "@/components/icons";
import { MobileAppNav } from "@/components/mobile-app-nav";
import { TeamCode } from "@/components/team-crest";
import { hasAdminRole } from "@/lib/auth/admin";
import { requireAppUser } from "@/lib/auth/app-user";
import { getAccountSummary } from "@/lib/eligibility/service";
import { getWeeklyResults, type RevealedGame } from "@/lib/results/service";
import { buildPickTrends, type PickTrend } from "@/lib/trends/rules";

export const metadata: Metadata = {
  title: "Pick trends",
  description: "See how the Any Given Pick field split on every weekly matchup after cards lock.",
};

const BUSINESS_TIME_ZONE = "America/Indiana/Indianapolis";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function statusLabel(game: RevealedGame): string {
  if (game.status === "in_progress") return "Live";
  if (game.status === "final") return "Final";
  if (game.status === "postponed") return "Postponed";
  if (game.status === "canceled") return "Canceled";
  return formatDateTime(game.kickoffAt);
}

function scoreLabel(game: RevealedGame): string | null {
  if (game.awayScore === null || game.homeScore === null) return null;
  return `${game.awayTeamCode} ${game.awayScore} · ${game.homeTeamCode} ${game.homeScore}`;
}

function trendSummary(trend: PickTrend): string {
  if (!trend.leaderCode) return trend.strengthLabel;
  return `${trend.leaderCode} leads the field`;
}

export default async function PickTrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const [{ userId }, params] = await Promise.all([auth(), searchParams]);
  if (!userId) redirect("/sign-in");

  const appUser = await requireAppUser(userId);
  const [account, isAdmin, results] = await Promise.all([
    getAccountSummary(appUser.id),
    hasAdminRole(appUser.id),
    getWeeklyResults({ weekId: params.week, currentUserId: appUser.id }),
  ]);
  if (account.accountState !== "active" && !isAdmin) redirect("/profile");

  const snapshot = buildPickTrends(results);
  const gamesById = new Map(results.games.map((game) => [game.id, game]));

  return (
    <main className="account-shell results-shell trends-shell">
      <header className="account-header">
        <Link href="/" className="account-brand" aria-label="Any Given Pick home" prefetch={false}>
          <BrandLockup />
        </Link>
        <div className="account-header__actions">
          <Link href="/" className="text-link" prefetch={false}>Current call sheet</Link>
          <Link href="/race" className="text-link" prefetch={false}>Live race</Link>
          <Link href="/results" className="text-link" prefetch={false}>Weekly results</Link>
          <Link href="/activity" className="text-link" prefetch={false}>My activity</Link>
          {isAdmin ? <Link href="/admin" className="text-link" prefetch={false}>Admin</Link> : null}
          <UserButton />
        </div>
      </header>

      <section className="account-sheet results-sheet trends-sheet">
        <div className="results-intro trends-intro">
          <div>
            <h1>Read the field</h1>
            <p>See where official cards agreed, split, or broke from the crowd. Trends stay sealed until the weekly deadline.</p>
          </div>
          <Icon name="standings" />
        </div>

        <nav className="results-hub-nav" aria-label="Results and activity">
          <Link href="/race" prefetch={false}>Live race</Link>
          <Link className="results-hub-nav__active" href="/trends" aria-current="page">Pick trends</Link>
          <Link href="/results" prefetch={false}>Weekly cards</Link>
          <Link href="/standings" prefetch={false}>Standings</Link>
          <Link href="/activity" prefetch={false}>My activity</Link>
        </nav>

        {results.weeks.length > 0 ? (
          <form className="results-week-picker" method="get">
            <label htmlFor="trends-week">Call sheet</label>
            <select id="trends-week" name="week" defaultValue={results.selectedWeek?.id}>
              {results.weeks.map((option) => (
                <option value={option.id} key={option.id}>{option.season} · {option.label}</option>
              ))}
            </select>
            <button type="submit" aria-label="Open pick trends">Open <span className="trends-week-picker__label">trends</span> <Icon name="arrow" /></button>
          </form>
        ) : null}

        {snapshot.status === "no_week" ? (
          <section className="results-state" aria-labelledby="trends-empty-title">
            <Icon name="clock" />
            <div><h2 id="trends-empty-title">No field to read yet</h2><p>Published call sheets will appear here.</p></div>
          </section>
        ) : snapshot.status === "sealed" && results.selectedWeek ? (
          <section className="results-state results-state--locked" aria-labelledby="trends-sealed-title">
            <Icon name="shield" />
            <div>
              <h2 id="trends-sealed-title">Pick trends stay sealed until lock</h2>
              <p>{results.selectedWeek.label} opens at {formatDateTime(results.selectedWeek.entryDeadline)}. No official selection counts are returned before then.</p>
            </div>
          </section>
        ) : (
          <section className="trends-board" aria-labelledby="trends-board-title">
            <header className="trends-board__header">
              <div>
                <p>{results.selectedWeek?.season} · {results.selectedWeek?.seasonPhase === "preseason" ? "Preseason" : "Regular season"}</p>
                <h2 id="trends-board-title">{results.selectedWeek?.label}</h2>
              </div>
              <strong>{snapshot.totalCards} official {snapshot.totalCards === 1 ? "card" : "cards"}</strong>
            </header>

            <div className="trends-summary" aria-label="Weekly trend summary">
              <div><strong>{snapshot.trends.length}</strong><span>Matchups</span></div>
              <div><strong>{snapshot.strongConsensusCount}</strong><span>Strong consensus</span></div>
              <div><strong>{snapshot.closeCallCount}</strong><span>Close calls</span></div>
            </div>

            <div className="trends-list">
              {snapshot.trends.map((trend) => {
                const game = gamesById.get(trend.gameId);
                if (!game) return null;
                const score = scoreLabel(game);
                return (
                  <article className={`trend-row trend-row--${trend.strength}`} key={trend.gameId}>
                    <header className="trend-row__status">
                      <span>{statusLabel(game)}</span>
                      {score ? <strong>{score}</strong> : null}
                      <b>{trend.strengthLabel}</b>
                    </header>

                    <div className="trend-row__teams">
                      <div className={`trend-team${trend.leaderCode === trend.awayTeamCode ? " trend-team--leader" : ""}`}>
                        <TeamCode code={trend.awayTeamCode} size="sm" />
                        <span><strong>{trend.awayPercent}%</strong><small>{trend.awayCount} {trend.awayCount === 1 ? "call" : "calls"}</small></span>
                      </div>
                      <span className="trend-row__at">@</span>
                      <div className={`trend-team trend-team--home${trend.leaderCode === trend.homeTeamCode ? " trend-team--leader" : ""}`}>
                        <span><strong>{trend.homePercent}%</strong><small>{trend.homeCount} {trend.homeCount === 1 ? "call" : "calls"}</small></span>
                        <TeamCode code={trend.homeTeamCode} size="sm" />
                      </div>
                    </div>

                    <div
                      className="trend-bar"
                      role="img"
                      aria-label={`${trend.awayTeamCode} received ${trend.awayPercent} percent of official calls. ${trend.homeTeamCode} received ${trend.homePercent} percent.`}
                    >
                      {trend.totalPicks > 0 ? (
                        <>
                          <span className="trend-bar__away" style={{ flexBasis: `${trend.awayPercent}%` }} />
                          <span className="trend-bar__home" style={{ flexBasis: `${trend.homePercent}%` }} />
                        </>
                      ) : <span className="trend-bar__empty" />}
                    </div>

                    <footer className="trend-row__footer">
                      <strong>{trendSummary(trend)}</strong>
                      <span>{trend.currentUserPick ? <>Your call: <b>{trend.currentUserPick}</b></> : "No call on your official card"}</span>
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </section>
      <MobileAppNav active="results" isAdmin={isAdmin} />
    </main>
  );
}
