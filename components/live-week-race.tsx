"use client";

import { useState } from "react";
import type { LiveRacePlayer, LiveWeekRace } from "@/lib/race/rules";
import type { ResultsWeekOption } from "@/lib/results/service";
import { Icon } from "./icons";
import { HomeLiveScoreRefresh } from "./home-live-score-refresh";
import { PlayerAvatar } from "./player-avatar";
import { TeamCode } from "./team-crest";

const BUSINESS_TIME_ZONE = "America/Indiana/Indianapolis";

function formatKickoff(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function gameTimingLabel(status: LiveWeekRace["gamesToFeature"][number]["status"], kickoffAt: string): string {
  if (status === "in_progress") return "Scores refresh every minute";
  if (status === "final") return "Game complete";
  if (status === "postponed") return "New time pending";
  if (status === "canceled") return "Game canceled";
  return formatKickoff(kickoffAt);
}

function movementLabel(change: number): string {
  if (change > 0) return `Up ${change}`;
  if (change < 0) return `Down ${Math.abs(change)}`;
  return "Even";
}

function PlayerPath({ player, mobile = false }: { player: LiveRacePlayer; mobile?: boolean }) {
  return (
    <aside className={`live-race-path${mobile ? " live-race-path--mobile" : " live-race-path--desktop"}`} aria-live="polite">
      <strong>{player.isCurrentUser ? "Your path" : `${player.displayName}'s path`}</strong>
      <p>{player.pathCopy}</p>
      <span>{player.pathLabel}</span>
    </aside>
  );
}

export function LiveWeekRaceBoard({ race, weekOptions }: { race: LiveWeekRace; weekOptions: ResultsWeekOption[] }) {
  const initialPlayerId = race.players.find((player) => player.isCurrentUser)?.userId
    ?? race.players[0]?.userId
    ?? "";
  const [selectedPlayerId, setSelectedPlayerId] = useState(initialPlayerId);
  const selectedPlayer = race.players.find((player) => player.userId === selectedPlayerId) ?? race.players[0];

  const allGamesComplete = race.gamesToFeature.length > 0
    && race.liveCount === 0
    && race.waitingCount === 0;
  const statusTitle = race.liveCount > 0
    ? `${race.liveCount} ${race.liveCount === 1 ? "game" : "games"} live`
    : allGamesComplete
      ? "Week final"
      : "Next games";
  const statusDetail = race.liveCount > 0
    ? "Live projection"
    : allGamesComplete
      ? "Official finish"
      : `${race.waitingCount} waiting`;

  return (
    <div className="live-race-board">
      <header className="live-race-heading">
        <div>
          <h1>Live week race</h1>
          <p>
            {race.week?.label} · {race.finalCount} final · {race.liveCount} live · rankings update with every score.
          </p>
        </div>
        <div className={`live-race-status${race.liveCount > 0 ? " live-race-status--active" : ""}`}>
          <span>{statusTitle}</span>
          <strong>{statusDetail}</strong>
        </div>
      </header>

      {weekOptions.length > 1 ? (
        <form className="live-race-week-picker" method="get">
          <label htmlFor="race-week">Race week</label>
          <select id="race-week" name="week" defaultValue={race.week?.id}>
            {weekOptions.map((week) => (
              <option value={week.id} key={week.id}>{week.season} · {week.label}</option>
            ))}
          </select>
          <button type="submit">Open race <Icon name="arrow" /></button>
        </form>
      ) : null}

      {race.gamesToFeature.length > 0 ? (
        <section className="live-race-games" aria-label="Games affecting the live race">
          {race.gamesToFeature.map((game) => (
            <article className="live-race-game" key={game.id}>
              <span>
                <TeamCode code={game.awayTeamCode} size="sm" />
                <b>{game.awayScore ?? "—"}</b>
              </span>
              <small>
                <strong>{game.displayStatus}</strong>
                <time dateTime={game.kickoffAt}>{gameTimingLabel(game.status, game.kickoffAt)}</time>
              </small>
              <span>
                <TeamCode code={game.homeTeamCode} size="sm" />
                <b>{game.homeScore ?? "—"}</b>
              </span>
            </article>
          ))}
        </section>
      ) : null}

      {race.liveCount > 0 || race.waitingCount > 0 ? (
        <HomeLiveScoreRefresh className="live-race-refresh" />
      ) : (
        <p className="live-race-refresh">Final scores are locked.</p>
      )}

      <section className="live-race-field" aria-labelledby="live-race-field-title">
        <header>
          <h2 id="live-race-field-title">The field right now</h2>
          <p>Select a player to see the calls that can move them toward first.</p>
        </header>
        <div className="live-race-table-head" aria-hidden="true">
          <span>Rank</span><span>Player</span><span>Right</span><span>Wrong</span><span>Live</span><span>Max</span><span>Move</span>
        </div>
        <div className="live-race-players">
          {race.players.map((player) => {
            const selected = player.userId === selectedPlayer?.userId;
            return (
              <div className="live-race-player-wrap" key={player.userId}>
                <button
                  className={`live-race-player${player.isCurrentUser ? " live-race-player--you" : ""}`}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedPlayerId(player.userId)}
                >
                  <strong className="live-race-player__rank"><small>Rank</small>{player.rank}</strong>
                  <span className="live-race-player__identity">
                    <PlayerAvatar displayName={player.displayName} photoUrl={player.profilePhotoUrl} size={36} />
                    <span><strong>{player.displayName}{player.isCurrentUser ? " · You" : ""}</strong><small>{player.unresolvedPickCodes.length > 0 ? `${player.unresolvedPickCodes.join(" · ")} still open` : "All calls settled"}</small></span>
                  </span>
                  <strong className="live-race-number"><small>Right</small>{player.correct}</strong>
                  <strong className="live-race-number"><small>Wrong</small>{player.incorrect}</strong>
                  <strong className="live-race-number"><small>Live</small>{player.live}</strong>
                  <strong className="live-race-number"><small>Max</small>{player.maxCorrect}</strong>
                  <span className={`live-race-move${player.rankChange < 0 ? " live-race-move--down" : ""}`} aria-label={movementLabel(player.rankChange)}>
                    {player.rankChange > 0 ? "↑" : player.rankChange < 0 ? "↓" : "—"}{player.rankChange === 0 ? "" : ` ${Math.abs(player.rankChange)}`}
                  </span>
                </button>
                {selected ? <PlayerPath player={player} mobile /> : null}
              </div>
            );
          })}
        </div>
        {selectedPlayer ? <PlayerPath player={selectedPlayer} /> : null}
      </section>
    </div>
  );
}
