import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { BrandLockup } from "@/components/brand-lockup";
import { Icon } from "@/components/icons";
import { MobileAppNav } from "@/components/mobile-app-nav";
import { ScoreRefreshControl } from "@/components/score-refresh-control";
import { hasAdminRole } from "@/lib/auth/admin";
import { requireAppUser } from "@/lib/auth/app-user";
import { getAccountSummary } from "@/lib/eligibility/service";
import {
  getPlayerActivity,
  type ActivityCard,
  type ActivityPick,
} from "@/lib/entries/activity-service";
import { getScoreSyncHealth } from "@/lib/scores/health";
import { hasScoreRefreshWindow, nextScoreRefreshWindow } from "@/lib/scores/refresh-window";

export const metadata: Metadata = {
  title: "My activity",
  description: "Review your current and past Any Given Pick cards.",
};

const BUSINESS_TIME_ZONE = "America/Indiana/Indianapolis";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function formatKickoff(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function gameStateLabel(pick: ActivityPick): string {
  if (pick.gameStatus === "final") return "Final";
  if (pick.gameStatus === "in_progress") return "Live";
  if (pick.gameStatus === "postponed") return "Postponed";
  if (pick.gameStatus === "canceled") return "Canceled";
  return "Upcoming";
}

function outcomeLabel(pick: ActivityPick): string {
  if (pick.outcome === "won") return "Won";
  if (pick.outcome === "lost") return "Lost";
  if (pick.outcome === "tie") return "Tie";
  if (pick.outcome === "no_pick") return "No pick";
  return gameStateLabel(pick);
}

function activityResultSummary(card: ActivityCard): string {
  const liveCount = card.picks.filter((pick) => pick.gameStatus === "in_progress").length;
  const upcomingCount = Math.max(0, card.gameCount - card.completedGameCount - liveCount);
  const graded = card.completedGameCount > 0
    ? `${card.winCount} won · ${card.lossCount} lost${card.tieCount > 0 ? ` · ${card.tieCount} tied` : ""}`
    : "No final results";
  const remaining = [
    liveCount > 0 ? `${liveCount} live` : null,
    upcomingCount > 0 ? `${upcomingCount} upcoming` : null,
  ].filter(Boolean).join(" · ");
  return remaining ? `${graded} · ${remaining}` : graded;
}

function groupPicksByDay(picks: ActivityPick[]): Array<{ label: string; picks: ActivityPick[] }> {
  const groups = new Map<string, ActivityPick[]>();
  for (const pick of picks) {
    const label = formatKickoff(pick.kickoffAt);
    groups.set(label, [...(groups.get(label) ?? []), pick]);
  }
  return Array.from(groups, ([label, groupedPicks]) => ({ label, picks: groupedPicks }));
}

function ActivityCardView({ card }: { card: ActivityCard }) {
  const pickGroups = groupPicksByDay(card.picks);
  return (
    <details className={`activity-card activity-card--${card.state}`}>
      <summary className="activity-card__summary">
        <span className="activity-card__marker" aria-hidden="true">
          {card.isCurrent ? "Now" : String(card.weekNumber).padStart(2, "0")}
        </span>
        <span className="activity-card__identity">
          <span className="activity-card__eyebrow">
            {card.season} · {card.seasonPhase === "preseason" ? "Preseason" : "Regular season"}
          </span>
          <strong>{card.weekLabel}</strong>
          <span className="activity-card__results">{activityResultSummary(card)}</span>
        </span>
        <span className={`activity-state activity-state--${card.state}`}>{card.stateLabel}</span>
        <span className="activity-card__count">
          <strong>{card.pickCount}</strong>
          <span>of {card.gameCount} picks</span>
        </span>
        <span className="activity-card__toggle" aria-hidden="true">
          <span>View {card.gameCount} picks</span>
          <span>Close picks</span>
        </span>
      </summary>

      <div className="activity-card__body">
        <div className="activity-card__meta">
          <div>
            <span>Card status</span>
            <strong>{card.stateLabel}</strong>
          </div>
          <div>
            <span>Tiebreaker total</span>
            <strong>{card.mondayPrediction ?? "—"}</strong>
          </div>
          <div>
            <span>{card.committedAt ? "Submitted" : "Last saved"}</span>
            <strong>
              {card.committedAt || card.updatedAt
                ? formatDateTime(card.committedAt ?? card.updatedAt ?? "")
                : "Not saved yet"}
            </strong>
          </div>
          <div>
            <span>Completed picks</span>
            <strong>
              {card.completedGameCount > 0
                ? `${card.winCount} won · ${card.lossCount} lost${card.tieCount > 0 ? ` · ${card.tieCount} tied` : ""}`
                : "Awaiting results"}
            </strong>
          </div>
        </div>

        {card.picks.length > 0 ? (
          <div className="activity-matchups" aria-label={`${card.weekLabel} selections`}>
            {pickGroups.map((group) => (
              <section className="activity-day-group" key={group.label}>
                <h4>{group.label}</h4>
                <div className="activity-day-group__games">
                  {group.picks.map((pick) => {
                    const awaySelected = pick.selectedTeamCode === pick.awayTeamCode;
                    const homeSelected = pick.selectedTeamCode === pick.homeTeamCode;
                    return (
                      <div
                        className={`activity-matchup activity-matchup--${pick.gameStatus} activity-matchup--${pick.outcome}`}
                        key={pick.gameId}
                        aria-label={`${pick.awayTeamName} at ${pick.homeTeamName}. ${pick.selectedTeamName ? `${pick.selectedTeamName} selected.` : "No selection."} ${outcomeLabel(pick)}.`}
                      >
                        <span className="activity-matchup__date">
                          <strong>{gameStateLabel(pick)}</strong>
                        </span>
                        <span className={`activity-team${awaySelected ? " activity-team--selected" : ""}`}>
                          <span className="activity-team__line">
                            <strong>{pick.awayTeamCode}</strong>
                            <span className="activity-team__call">
                              {pick.awayScore !== null ? <b>{pick.awayScore}</b> : null}
                              {awaySelected ? <Icon name="check" /> : null}
                            </span>
                          </span>
                          <small>{pick.awayTeamName}</small>
                        </span>
                        <span className="activity-matchup__at">@</span>
                        <span className={`activity-team${homeSelected ? " activity-team--selected" : ""}`}>
                          <span className="activity-team__line">
                            <strong>{pick.homeTeamCode}</strong>
                            <span className="activity-team__call">
                              {pick.homeScore !== null ? <b>{pick.homeScore}</b> : null}
                              {homeSelected ? <Icon name="check" /> : null}
                            </span>
                          </span>
                          <small>{pick.homeTeamName}</small>
                        </span>
                        <span className={`activity-outcome activity-outcome--${pick.outcome}`}>
                          {outcomeLabel(pick)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="activity-card__empty">
            <Icon name="picks" />
            <div>
              <h4>No calls on this card yet</h4>
              <p>Open the current call sheet to start making selections.</p>
            </div>
          </div>
        )}

        {card.isCurrent ? (
          <Link className="activity-card__action" href="/" prefetch={false}>
            <span>{card.pickCount > 0 ? "Open current card" : "Make current picks"}</span>
            <Icon name="arrow" />
          </Link>
        ) : null}
      </div>
    </details>
  );
}

export default async function ActivityPage() {
  await auth.protect();
  const appUser = await requireAppUser();
  const [account, activity, isAdmin, scoreHealth] = await Promise.all([
    getAccountSummary(appUser.id),
    getPlayerActivity(appUser.id),
    hasAdminRole(appUser.id),
    getScoreSyncHealth(),
  ]);

  if (account.accountState !== "active" && !isAdmin) redirect("/profile");
  const scoreGames = activity.cards.flatMap((card) => card.picks);
  const shouldPollScores = hasScoreRefreshWindow(scoreGames);
  const nextAutomaticCheckAt = nextScoreRefreshWindow(scoreGames);

  return (
    <main className="account-shell activity-shell">
      <header className="account-header">
        <Link href="/" className="account-brand" aria-label="Any Given Pick home" prefetch={false}>
          <BrandLockup />
        </Link>
        <div className="account-header__actions">
          <Link href="/" className="text-link" prefetch={false}>Current call sheet</Link>
          <Link href="/results" className="text-link" prefetch={false}>Weekly results</Link>
          <Link href="/profile" className="text-link" prefetch={false}>Player card</Link>
          {isAdmin ? <Link href="/admin" className="text-link" prefetch={false}>Admin</Link> : null}
          <UserButton />
        </div>
      </header>

      <section className="account-sheet activity-sheet">
        <div className="activity-intro">
          <div>
            <p className="week-label">My activity</p>
            <h1>Your call sheet archive</h1>
            <p>
              {account.displayName ? `${account.displayName}, this is` : "This is"} your private record of current and past pick cards. Past weeks always show the latest official version you submitted.
            </p>
          </div>
          <Icon name="activity" />
        </div>

        <nav className="results-hub-nav" aria-label="Results and activity">
          <Link href="/results" prefetch={false}>Weekly cards</Link>
          <Link href="/standings" prefetch={false}>Standings</Link>
          <Link className="results-hub-nav__active" href="/activity" aria-current="page">My activity</Link>
        </nav>

        <div className="activity-scoreboard" aria-label="Activity summary">
          <div><strong>{activity.cards.length}</strong><span>Total cards</span></div>
          <div><strong>{activity.officialCardCount}</strong><span>Official</span></div>
          <div><strong>{activity.draftCardCount}</strong><span>Draft only</span></div>
        </div>

        <section className="activity-section" aria-labelledby="current-card-title">
          <div className="activity-section__header">
            <div>
              <p>On the board</p>
              <h2 id="current-card-title">Current card</h2>
            </div>
            <span>Working picks update here after a secure draft save.</span>
          </div>
          <ScoreRefreshControl
            initialLastSuccessAt={scoreHealth.lastSuccessAt}
            shouldPoll={shouldPollScores}
            nextAutomaticCheckAt={nextAutomaticCheckAt}
          />
          {activity.currentCard ? (
            <ActivityCardView card={activity.currentCard} />
          ) : (
            <div className="activity-empty">
              <Icon name="clock" />
              <div>
                <h3>No current card is open</h3>
                <p>The commissioner has not published a week yet.</p>
              </div>
            </div>
          )}
        </section>

        <section className="activity-section" aria-labelledby="past-cards-title">
          <div className="activity-section__header">
            <div>
              <p>Film room</p>
              <h2 id="past-cards-title">Past cards</h2>
            </div>
            <span>Newest first. Expand a card to review every matchup.</span>
          </div>
          {activity.pastCards.length > 0 ? (
            <div className="activity-history">
              {activity.pastCards.map((card) => <ActivityCardView card={card} key={card.id} />)}
            </div>
          ) : (
            <div className="activity-empty">
              <Icon name="activity" />
              <div>
                <h3>Your archive starts here</h3>
                <p>Completed weeks will move into this section automatically.</p>
              </div>
            </div>
          )}
        </section>
      </section>
      <MobileAppNav active="results" isAdmin={isAdmin} />
    </main>
  );
}
