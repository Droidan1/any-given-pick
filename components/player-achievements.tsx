import { Icon } from "./icons";
import type { PlayerAchievements as PlayerAchievementsData } from "@/lib/achievements/rules";

export function PlayerAchievements({ data }: { data: PlayerAchievementsData }) {
  return (
    <section className="achievement-board" aria-labelledby="achievement-board-title">
      <header className="achievement-board__header">
        <span className="achievement-board__mark" aria-hidden="true"><Icon name="award" /></span>
        <div>
          <h2 id="achievement-board-title">Player achievements</h2>
          <p>Patches unlock automatically from official cards and final results.</p>
        </div>
        <strong><b>{data.earnedCount}</b> of {data.totalCount} earned</strong>
      </header>

      <div className="achievement-ledger">
        {data.achievements.map((achievement) => {
          const progress = Math.min(100, Math.round((achievement.progress / achievement.target) * 100));
          return (
            <article
              className={`achievement-row${achievement.earned ? " achievement-row--earned" : ""}`}
              key={achievement.id}
            >
              <span className="achievement-patch" aria-hidden="true">
                <small>AGP</small>
                <strong>{achievement.symbol}</strong>
              </span>
              <div className="achievement-row__copy">
                <div className="achievement-row__title">
                  <h3>{achievement.title}</h3>
                  <span>{achievement.earned ? "Earned" : "In progress"}</span>
                </div>
                <p>{achievement.description}</p>
                <div
                  className="achievement-progress"
                  role="progressbar"
                  aria-label={`${achievement.title}: ${achievement.progressLabel}`}
                  aria-valuemin={0}
                  aria-valuemax={achievement.target}
                  aria-valuenow={Math.min(achievement.progress, achievement.target)}
                >
                  <span style={{ width: `${progress}%` }} />
                </div>
                <small>{achievement.earned ? `Unlocked · ${achievement.earnedOn}` : achievement.progressLabel}</small>
              </div>
              <Icon name={achievement.earned ? "check" : "clock"} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
