import Link from "next/link";
import type { AccountSummary } from "@/lib/account-types";
import type { StandingsSnapshot } from "@/lib/standings/types";
import { Icon } from "./icons";
import { PickemServerShell } from "./pickem-home";
import { PlayerAvatar } from "./player-avatar";

export function PickemStandings({
  account,
  isAdmin,
  standings,
  currentUserId,
}: {
  account: AccountSummary;
  isAdmin: boolean;
  standings: StandingsSnapshot;
  currentUserId: string;
}) {
  const content = standings.status === "ready" && standings.rows.length > 0 ? (
    <section className="single-view standings-view">
      <p className="week-label">{standings.season} regular-season standings</p>
      <h1>The official board.</h1>
      <p className="lead">
        Regular-season results through Week {standings.throughWeek ?? 1}. Preseason picks
        are excluded. Lower cumulative tiebreaker difference wins equal records.
      </p>
      <div className="standings-table" role="table" aria-label={`${standings.season} regular-season standings`}>
        <div className="standings-row standings-row--header" role="row">
          <span>Rank</span><span>Player</span><span>Correct</span><span>TB diff</span>
        </div>
        {standings.rows.map((entry) => (
          <div
            className={`standings-row${entry.userId === currentUserId ? " standings-row--you" : ""}`}
            role="row"
            key={entry.userId}
          >
            <strong>{entry.rank}</strong>
            <span className="standings-player"><PlayerAvatar displayName={entry.displayName} photoUrl={entry.profilePhotoUrl} size={32} />{entry.displayName}</span>
            <span>{entry.correctPicks}/{entry.gradedPicks}</span>
            <span>{entry.tiebreakerDiff ?? "—"}</span>
          </div>
        ))}
      </div>
      <Link className="standings-results-link" href="/results" prefetch={false}>View weekly results <Icon name="arrow" /></Link>
    </section>
  ) : (
    <section className="single-view standings-view">
      <p className="week-label">{standings.season} regular-season standings</p>
      <h1>The board opens after Week 1.</h1>
      <p className="lead">
        Preseason picks do not count toward the standings. Rankings begin after every
        regular-season Week 1 game has a final result.
      </p>
      <div className="empty-state">
        <Icon name="standings" />
        <h2>{standings.status === "ready" ? "No official entries" : "No standings yet"}</h2>
        <p>
          {standings.status === "ready"
            ? "Week 1 is final, but no official player entries are available to rank."
            : standings.weekOneGameCount > 0
              ? `${standings.weekOneFinalGames} of ${standings.weekOneGameCount} Week 1 games are final.`
              : "Week 1 results will set the first official leaderboard."}
        </p>
      </div>
      <Link className="standings-results-link" href="/results" prefetch={false}>View weekly results <Icon name="arrow" /></Link>
    </section>
  );

  return (
    <PickemServerShell account={account} isAdmin={isAdmin} active="standings">
      {content}
    </PickemServerShell>
  );
}
