import { PlayerAvatar } from "./player-avatar";
import { TeamCode } from "./team-crest";
import { WeeklyRecapShare } from "./weekly-recap-share";
import type { WeeklyRecap } from "@/lib/recap/rules";

function finishLabel(recap: WeeklyRecap): string {
  if (recap.rank === null) return "—";
  return `${recap.tiedAtRank ? "T-" : "No. "}${recap.rank}`;
}

function recordLabel(recap: WeeklyRecap): string {
  const parts = [`${recap.correctPicks}-${recap.incorrectPicks}`];
  if (recap.tiedPicks > 0) parts.push(`${recap.tiedPicks} tie`);
  if (recap.voidPicks > 0) parts.push(`${recap.voidPicks} void`);
  return parts.join(" · ");
}

function shareText(recap: WeeklyRecap): string {
  const finish = recap.rank === null
    ? "finished the week"
    : `finished ${recap.tiedAtRank ? "tied at " : ""}No. ${recap.rank} of ${recap.fieldSize}`;
  const boldest = recap.boldestHit
    ? ` My strongest hit was ${recap.boldestHit.teamCode}, picked by ${recap.boldestHit.pickPercent}% of the field.`
    : "";
  return `I ${finish} in Any Given Pick ${recap.week.label} with ${recap.correctPicks} of ${recap.gradedPicks} correct.${boldest}`;
}

function finishSummary(recap: WeeklyRecap): string {
  if (recap.rank === 1) {
    return recap.tiedAtRank
      ? "You finished level at the top of this week’s field."
      : "You called the strongest card in this week’s field.";
  }

  return `You finished ahead of ${recap.playersBehind} ${recap.playersBehind === 1 ? "player" : "players"}.`;
}

export function WeeklyRecapCard({ recap }: { recap: WeeklyRecap }) {
  if (recap.status !== "ready" || !recap.player) {
    return (
      <section className={`weekly-recap weekly-recap--${recap.status}`} aria-labelledby="weekly-recap-title">
        <header>
          <div>
            <h2 id="weekly-recap-title">Weekly recap</h2>
            <p>{recap.week.season} · {recap.week.label}</p>
          </div>
          <strong>{recap.status === "waiting" ? `${recap.completedGames}/${recap.gameCount} final` : "No official card"}</strong>
        </header>
        <div className="weekly-recap__waiting">
          <span aria-hidden="true">{recap.status === "waiting" ? "4Q" : "—"}</span>
          <div>
            <h3>{recap.status === "waiting" ? "The recap is still being written." : "No recap for this week."}</h3>
            <p>{recap.status === "waiting"
              ? "Your final finish, boldest hit, and tiebreaker result unlock after every game is final."
              : "Only an official card submitted before the deadline receives a weekly recap."}</p>
          </div>
        </div>
      </section>
    );
  }

  const boldCallLabel = recap.boldestHit && recap.boldestHit.pickPercent <= 50
    ? "Boldest hit"
    : "Strongest hit";

  return (
    <section className="weekly-recap weekly-recap--ready" aria-labelledby="weekly-recap-title">
      <header className="weekly-recap__header">
        <div className="weekly-recap__player">
          <PlayerAvatar displayName={recap.player.displayName} photoUrl={recap.player.profilePhotoUrl} size={46} />
          <div>
            <h2 id="weekly-recap-title">{recap.player.displayName}&apos;s weekly recap</h2>
            <p>{recap.week.season} · {recap.week.seasonPhase === "preseason" ? "Preseason" : "Regular season"} · {recap.week.label}</p>
          </div>
        </div>
        <strong>Final</strong>
      </header>

      <div className="weekly-recap__call">
        <div>
          <h3>{recap.correctPicks} correct. {finishLabel(recap)}.</h3>
          <p>{finishSummary(recap)}</p>
        </div>
        <span className="weekly-recap__rank"><small>Finish</small><strong>{finishLabel(recap)}</strong><b>of {recap.fieldSize}</b></span>
      </div>

      <dl className="weekly-recap__stats">
        <div><dt>Record</dt><dd>{recordLabel(recap)}</dd></div>
        <div><dt>Accuracy</dt><dd>{recap.winRate}%</dd></div>
        <div><dt>Hit streak</dt><dd>{recap.bestStreak}</dd></div>
        <div><dt>Field</dt><dd>{recap.fieldSize}</dd></div>
      </dl>

      <div className="weekly-recap__film">
        <div className="weekly-recap__bold-call">
          <span>{boldCallLabel}</span>
          {recap.boldestHit ? (
            <>
              <TeamCode code={recap.boldestHit.teamCode} size="md" />
              <p>{recap.boldestHit.teamName} came through. Only <strong>{recap.boldestHit.pickPercent}%</strong> of official cards made that call.</p>
            </>
          ) : <p>No winning selection was available for a field comparison.</p>}
        </div>
        <div className="weekly-recap__tiebreaker">
          <span>Tiebreaker</span>
          <strong>{recap.tiebreaker?.prediction ?? "—"}</strong>
          <p>{recap.tiebreaker?.actual === null
            ? "The designated total was not graded."
            : `Actual ${recap.tiebreaker?.actual} · Off by ${recap.tiebreaker?.difference}`}</p>
        </div>
      </div>

      <footer className="weekly-recap__footer">
        <p>One sheet. Every call. This is how your week finished.</p>
        <WeeklyRecapShare text={shareText(recap)} />
      </footer>
    </section>
  );
}
