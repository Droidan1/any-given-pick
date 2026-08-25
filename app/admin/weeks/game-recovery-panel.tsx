"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TeamCode } from "@/components/team-crest";
import type { AdminWeekDetail } from "@/lib/admin/weeks";
import {
  recoverGame,
  saveFinalScore,
  type AdminActionResult,
} from "./actions";

type RecoveryGame = AdminWeekDetail["games"][number];

function toLocalDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatKickoff(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(isoDate));
}

export function GameRecoveryPanel({ games }: { games: RecoveryGame[] }) {
  const router = useRouter();
  const [result, setResult] = useState<AdminActionResult | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [replacementKickoffs, setReplacementKickoffs] = useState<Record<string, string>>(
    () => Object.fromEntries(games.map((game) => [game.id, toLocalDateTime(game.kickoffAt)])),
  );
  const [scores, setScores] = useState<Record<string, { away: string; home: string }>>(
    () => Object.fromEntries(games.map((game) => [game.id, {
      away: game.awayScore === null ? "" : String(game.awayScore),
      home: game.homeScore === null ? "" : String(game.homeScore),
    }])),
  );
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<AdminActionResult>) {
    setResult(null);
    startTransition(async () => {
      try {
        const nextResult = await action();
        setResult(nextResult);
        if (nextResult.ok) {
          setConfirmingCancelId(null);
          setReschedulingId(null);
          router.refresh();
        }
      } catch {
        setResult({ ok: false, message: "The game could not be updated. Check your connection and try again." });
      }
    });
  }

  function saveReschedule(gameId: string) {
    const localKickoff = replacementKickoffs[gameId];
    const replacement = localKickoff ? new Date(localKickoff) : null;

    if (!replacement || Number.isNaN(replacement.getTime())) {
      setResult({ ok: false, message: "Choose a valid replacement kickoff before saving." });
      return;
    }

    const kickoffAt = replacement.toISOString();
    run(() => recoverGame({ gameId, action: "reschedule", kickoffAt }));
  }

  function saveScore(gameId: string) {
    const score = scores[gameId] ?? { away: "", home: "" };
    run(() => saveFinalScore({
      gameId,
      awayScore: Number(score.away),
      homeScore: Number(score.home),
    }));
  }

  return (
    <section className="admin-game-recovery" aria-labelledby="game-recovery-title">
      <header>
        <div>
          <h2 id="game-recovery-title">Game recovery</h2>
          <p>Use an explicit ruling when the provider cannot finish a game automatically. Every change is recorded in the audit log.</p>
        </div>
        <span>{games.length} games</span>
      </header>

      {result ? (
        <p className={result.ok ? "admin-result admin-result--success" : "admin-result admin-result--error"} role="status">
          {result.message}
        </p>
      ) : null}

      <div className="admin-recovery-list">
        {games.map((game) => {
          const score = scores[game.id] ?? { away: "", home: "" };
          const cancelConfirming = confirmingCancelId === game.id;
          return (
            <details className="admin-recovery-game" key={game.id}>
              <summary>
                <span className={`admin-recovery-status admin-recovery-status--${game.status}`}>{game.status.replace("_", " ")}</span>
                <strong><TeamCode code={game.awayTeamCode} size="xs" />{game.awayTeamCode} at <TeamCode code={game.homeTeamCode} size="xs" />{game.homeTeamCode}</strong>
                <time dateTime={game.kickoffAt}>{formatKickoff(game.kickoffAt)}</time>
                <span className="admin-recovery-expand">Manage</span>
              </summary>
              <div className="admin-recovery-body">
                <section>
                  <h3>Schedule status</h3>
                  <div className="admin-recovery-actions">
                    <button type="button" onClick={() => run(() => recoverGame({ gameId: game.id, action: "postpone" }))} disabled={isPending || game.status === "postponed"}>Mark postponed</button>
                    <button type="button" onClick={() => setReschedulingId((current) => current === game.id ? null : game.id)} disabled={isPending}>Reschedule</button>
                    {!cancelConfirming ? (
                      <button type="button" className="admin-recovery-cancel" onClick={() => setConfirmingCancelId(game.id)} disabled={isPending || game.status === "canceled"}>Cancel game…</button>
                    ) : (
                      <span className="admin-recovery-confirm">
                        <button type="button" className="admin-recovery-cancel" onClick={() => run(() => recoverGame({ gameId: game.id, action: "cancel" }))} disabled={isPending}>Confirm cancel</button>
                        <button type="button" onClick={() => setConfirmingCancelId(null)} disabled={isPending}>Keep game</button>
                      </span>
                    )}
                  </div>
                  {reschedulingId === game.id ? (
                    <div className="admin-reschedule-control">
                      <label>
                        <span>Replacement kickoff</span>
                        <input
                          type="datetime-local"
                          value={replacementKickoffs[game.id] ?? ""}
                          onChange={(event) => setReplacementKickoffs((current) => ({ ...current, [game.id]: event.target.value }))}
                          disabled={isPending}
                        />
                      </label>
                      <button type="button" onClick={() => saveReschedule(game.id)} disabled={isPending || !replacementKickoffs[game.id]}>Save new kickoff</button>
                    </div>
                  ) : null}
                </section>

                <section>
                  <h3>Final score fallback</h3>
                  <div className="admin-score-control">
                    <label><span>{game.awayTeamCode}</span><input type="number" min="0" max="100" inputMode="numeric" value={score.away} onChange={(event) => setScores((current) => ({ ...current, [game.id]: { ...score, away: event.target.value } }))} disabled={isPending} /></label>
                    <label><span>{game.homeTeamCode}</span><input type="number" min="0" max="100" inputMode="numeric" value={score.home} onChange={(event) => setScores((current) => ({ ...current, [game.id]: { ...score, home: event.target.value } }))} disabled={isPending} /></label>
                    <button type="button" onClick={() => saveScore(game.id)} disabled={isPending || score.away === "" || score.home === ""}>{isPending ? "Saving…" : "Save final"}</button>
                  </div>
                </section>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
