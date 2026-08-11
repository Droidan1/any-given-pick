import type { Metadata } from "next";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { BrandLockup } from "@/components/brand-lockup";
import { Icon } from "@/components/icons";
import { MobileAppNav } from "@/components/mobile-app-nav";
import { getAdminPicksBoard, type AdminPlayerPickCard } from "@/lib/admin/picks";
import { hasAdminRole } from "@/lib/auth/admin";
import { requireAppUser } from "@/lib/auth/app-user";
import type { RevealedPick } from "@/lib/results/service";

export const metadata: Metadata = {
  title: "Player picks",
  description: "Review every approved player's official Any Given Pick card.",
};

const adminPicksDesignContract = `<!--
THESIS: Player review is one transparent post-lock roster, not a surveillance dashboard; submission presence is visible early, selections are not.
OWN-WORLD: Field-green booth, warm ruled paper, maize revealed calls, clay exceptions, condensed commands, and hard-edged roster rows.
STORY: Choose a week, confirm who submitted, wait for the server lock, then open each official card and inspect every call.
FIRST VIEWPORT: The booth header leads into the selected week, lock policy, and one scannable player ledger with no decorative metrics.
FORM: Administrator roster extension inside the established Coach's Call Sheet world; incumbent seed dbd731b4.
FINISH: unreviewed is unfinished; this build ends with the finish review, the verdict, and privacy regression proof.
-->`;

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
  if (pick.awayScore === null || pick.homeScore === null) return "Score pending";
  return `${pick.awayTeamCode} ${pick.awayScore} · ${pick.homeTeamCode} ${pick.homeScore}`;
}

function statusLabel(player: AdminPlayerPickCard): string {
  if (player.submissionStatus === "submitted") return "Official entry";
  if (player.submissionStatus === "disqualified") return "Disqualified";
  return "Not submitted";
}

export default async function AdminPicksPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await auth.protect();
  const appUser = await requireAppUser();
  const isAdmin = await hasAdminRole(appUser.id);

  if (!isAdmin) {
    return (
      <main className="admin-access-shell" data-design-seed="dbd731b4">
        <template dangerouslySetInnerHTML={{ __html: adminPicksDesignContract }} />
        <section className="admin-access-sheet">
          <Link href="/" className="admin-brand" aria-label="Any Given Pick home"><BrandLockup /></Link>
          <h1>This call is for the coaching staff</h1>
          <p>Your account is signed in, but it does not have administrator access.</p>
          <Link href="/" className="admin-return-link">Return to the player call sheet</Link>
        </section>
        <MobileAppNav active="admin" />
      </main>
    );
  }

  const { week } = await searchParams;
  const board = await getAdminPicksBoard({
    weekId: week,
    currentUserId: appUser.id,
  });

  return (
    <main className="admin-shell" data-design-seed="dbd731b4">
      <template dangerouslySetInnerHTML={{ __html: adminPicksDesignContract }} />
      <header className="admin-header">
        <Link href="/" className="admin-brand" aria-label="Any Given Pick home"><BrandLockup /></Link>
        <div className="admin-header__title"><strong>Player picks</strong><span>Coach&apos;s booth</span></div>
        <div className="admin-header__actions">
          <Link href="/admin" className="admin-text-link">Admin settings</Link>
          <Link href="/" className="admin-text-link">Player view</Link>
          <UserButton />
        </div>
      </header>

      <section className="admin-picks-workspace" aria-labelledby="admin-picks-title">
        <div className="admin-picks-intro">
          <div>
            <h1 id="admin-picks-title">Every official call</h1>
            <p>Confirm who submitted, then inspect every official selection after the weekly lock. Drafts and unsent edits are never shown.</p>
          </div>
          <Icon name="results" />
        </div>

        {board.weeks.length > 0 ? (
          <form className="admin-picks-week-picker" method="get">
            <label htmlFor="admin-picks-week">Contest week</label>
            <select id="admin-picks-week" name="week" defaultValue={board.selectedWeek?.id}>
              {board.weeks.map((option) => (
                <option value={option.id} key={option.id}>{option.season} · {option.label}</option>
              ))}
            </select>
            <button type="submit">Review week <Icon name="arrow" /></button>
          </form>
        ) : null}

        {board.revealStatus === "no_week" ? (
          <section className="admin-picks-empty">
            <Icon name="clock" />
            <div><h2>No published weeks</h2><p>Publish a contest week before reviewing player entries.</p></div>
          </section>
        ) : (
          <>
            <div className="admin-picks-ledger-heading">
              <div>
                <h2>{board.selectedWeek?.label}</h2>
                <p>{board.players.length} approved {board.players.length === 1 ? "player" : "players"} · {board.submittedCount} official {board.submittedCount === 1 ? "entry" : "entries"}{board.disqualifiedCount > 0 ? ` · ${board.disqualifiedCount} disqualified` : ""}</p>
              </div>
              <span className={`admin-picks-lock-state admin-picks-lock-state--${board.revealStatus}`}>
                {board.revealStatus === "revealed" ? "Picks revealed" : "Picks sealed"}
              </span>
            </div>

            {board.revealStatus === "open" && board.selectedWeek ? (
              <section className="admin-picks-seal-note">
                <Icon name="shield" />
                <div><h2>Selections unlock at the deadline</h2><p>Submission status is available now. Actual team selections remain sealed until {formatDateTime(board.selectedWeek.entryDeadline)} so administrators who also play never gain an early advantage.</p></div>
              </section>
            ) : null}

            <section className="admin-picks-roster" aria-label={`${board.selectedWeek?.label} player entries`}>
              {board.players.length > 0 ? board.players.map((player) => {
                if (!player.entry) {
                  return (
                    <div className="admin-player-picks admin-player-picks--status" key={player.userId}>
                      <strong>{player.displayName}</strong>
                      <span className={`admin-player-picks__status admin-player-picks__status--${player.submissionStatus}`}>{statusLabel(player)}</span>
                    </div>
                  );
                }

                return (
                  <details className="admin-player-picks" open={player.userId === appUser.id} key={player.userId}>
                    <summary>
                      <span className="admin-player-picks__identity"><strong>{player.displayName}</strong><small>Official version {player.entry.versionNumber} · {formatDateTime(player.entry.committedAt)}</small></span>
                      <span className="admin-player-picks__status admin-player-picks__status--submitted">Official entry</span>
                      <span className="admin-player-picks__measure"><strong>{player.entry.correctPicks}/{player.entry.gradedPicks}</strong><small>correct</small></span>
                      <span className="admin-player-picks__measure"><strong>{player.entry.mondayPrediction}</strong><small>tiebreaker</small></span>
                      <span className="admin-player-picks__toggle" aria-hidden="true">
                        <span className="admin-player-picks__toggle-closed">View picks</span>
                        <span className="admin-player-picks__toggle-open">Close picks</span>
                      </span>
                    </summary>
                    <div className="admin-player-picks__calls">
                      {player.entry.picks.map((pick) => (
                        <div className={`admin-pick-call admin-pick-call--${pick.outcome}`} key={pick.gameId}>
                          <span><strong>{pick.awayTeamCode} @ {pick.homeTeamCode}</strong><small>{scoreLabel(pick)}</small></span>
                          <span><small>Selected</small><strong>{pick.selectedTeamCode} · {pick.selectedTeamName}</strong></span>
                          <b>{resultLabel(pick)}</b>
                        </div>
                      ))}
                    </div>
                  </details>
                );
              }) : (
                <div className="admin-picks-empty admin-picks-empty--roster"><Icon name="profile" /><div><h2>No approved player cards</h2><p>Approved players appear here after completing a player card.</p></div></div>
              )}
            </section>
          </>
        )}
      </section>
      <MobileAppNav active="admin" isAdmin />
    </main>
  );
}
